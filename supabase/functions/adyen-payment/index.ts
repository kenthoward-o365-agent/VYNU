import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceRateLimit, getClientIp, tooManyRequests } from "../_shared/rate-limit.ts";
import { safeErrorResponse } from "../_shared/safe-error.ts";

// build: mock-fallback v2

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── H&L Pay — Mock Responses ──
// In mock mode we expose card + applepay + googlepay so the Drop-in UI
// renders the wallet buttons even without real processor credentials.
const MOCK_PAYMENT_METHODS = {
  paymentMethods: [
    {
      type: "scheme",
      name: "Credit Card",
      brands: ["visa", "mc", "amex"],
    },
    {
      type: "applepay",
      name: "Apple Pay",
      configuration: {
        merchantId: "MOCK_APPLEPAY",
        merchantName: "H&L Pay (Test)",
      },
    },
    {
      type: "googlepay",
      name: "Google Pay",
      configuration: {
        merchantId: "MOCK_GOOGLEPAY",
        merchantName: "H&L Pay (Test)",
        gatewayMerchantId: "MOCK_GATEWAY",
      },
    },
  ],
};

function mockPayment(body: any) {
  // PAY-01: simulated payments NEVER accept real card data. In mock mode the
  // diner-side UI collects no PAN/CVV — it simply submits a "simulate payment"
  // request — so authorisation here is based purely on the mock flag, never on a
  // card number.

  // Stored card (simulated saved token) always succeeds.
  if (body.stored_card_token) {
    return {
      resultCode: "Authorised",
      pspReference: `MOCK_${Date.now()}`,
      merchantReference: body.reference,
      additionalData: { cardSummary: "1111", paymentMethod: "visa" },
      mock_mode: true,
    };
  }

  // Wallet / encrypted Drop-in payloads are NOT supported in mock mode (the
  // diner-side UI disables those buttons when mock_mode is true), so anything
  // reaching here that claims to be a wallet payment is rejected.
  if (body.payment_method) {
    return {
      resultCode: "Refused",
      refusalReason:
        "Simulated mode does not support wallet or encrypted card payments.",
      merchantReference: body.reference,
      mock_mode: true,
    };
  }

  // Plain simulated payment (no card data collected). Authorise, and return a
  // simulated stored-card token when the diner asked to save a card.
  const response: any = {
    resultCode: "Authorised",
    pspReference: `MOCK_${Date.now()}`,
    merchantReference: body.reference,
    mock_mode: true,
  };

  if (body.store_card) {
    response.additionalData = {
      "recurring.recurringDetailReference": `MOCK_TOKEN_${Date.now()}`,
      "recurring.shopperReference": body.shopper_reference,
      cardSummary: "1111",
      paymentMethod: "visa",
    };
  } else {
    response.additionalData = { cardSummary: "1111", paymentMethod: "visa" };
  }

  return response;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth is optional for consumer flows
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await callerClient.auth.getUser();
      userId = user?.id || null;
    }

    // Capture origin/IP for Adyen risk + 3DS
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    const shopperIP =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      undefined;

    const body = await req.json();
    const { action, venue_id } = body;

    if (!venue_id) return json({ error: "venue_id required" }, 400);

    // Fetch venue payment config — try "ordrpayments" first, fall back to "adyen"
    let { data: config } = await adminClient
      .from("venue_payment_config")
      .select("*")
      .eq("venue_id", venue_id)
      .eq("provider", "ordrpayments")
      .maybeSingle();

    if (!config) {
      const fallback = await adminClient
        .from("venue_payment_config")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("provider", "adyen")
        .maybeSingle();
      config = fallback.data;
    }

    if (!config) {
      return json({ error: "No payment configuration found for this venue" }, 404);
    }

    // Prefer Vault for secrets; fall back to legacy columns if not yet migrated.
    const loadSecret = async (field: string): Promise<string | null> => {
      try {
        const { data } = await adminClient.rpc("get_payment_secret", {
          _venue_id: venue_id,
          _field: field,
        });
        return (data as string) || null;
      } catch { return null; }
    };
    const [vaultApiTest, vaultApiLive, vaultCkTest, vaultCkLive, vaultHmac] = await Promise.all([
      loadSecret("api_key_test"),
      loadSecret("api_key_live"),
      loadSecret("client_key_test"),
      loadSecret("client_key_live"),
      loadSecret("hmac_key"),
    ]);
    config.api_key_test    = vaultApiTest    ?? config.api_key_test;
    config.api_key_live    = vaultApiLive    ?? config.api_key_live;
    config.client_key_test = vaultCkTest     ?? config.client_key_test;
    config.client_key_live = vaultCkLive     ?? config.client_key_live;
    config.hmac_key        = vaultHmac       ?? config.hmac_key;


    if (!config.is_active && action !== "test_connection") {
      return json({ error: "Payments are not enabled for this venue" }, 400);
    }

    // Mock whenever we're in test mode AND the venue isn't fully provisioned
    // (no test API key, no client key, or merchant_account looks invalid).
    // This lets venues demo the full payment flow before H&L Pay credentials land.
    const merchantAccountLooksValid =
      !!config.merchant_account &&
      !config.merchant_account.includes("@") &&
      config.merchant_account.length >= 3;
    const isMock =
      config.environment === "test" &&
      (!config.api_key_test ||
        !config.client_key_test ||
        !merchantAccountLooksValid ||
        config.merchant_status === "pending");

    const apiKey = config.environment === "live" ? config.api_key_live : config.api_key_test;
    const merchantAccount = config.merchant_account;

    const baseUrl = config.environment === "live"
      ? "https://checkout-live.adyen.com/v71"
      : "https://checkout-test.adyen.com/v71";

    // ═══ TEST CONNECTION ═══
    if (action === "test_connection") {
      if (isMock) {
        return json({
          success: true,
          message: "H&L Pay test mode active — test cards will simulate payments.",
        });
      }

      if (!apiKey || !merchantAccount) {
        return json({ error: "H&L Pay account not yet provisioned for this venue" }, 400);
      }

      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({
          merchantAccount,
          countryCode: config.country_code || "AU",
          amount: { value: 0, currency: config.default_currency || "AUD" },
          channel: "Web",
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const methods = (data.paymentMethods || []).map((m: any) => m.name || m.type);
        return json({
          success: true,
          message: `Connected to H&L Pay. Available methods: ${methods.join(", ")}`,
          methods: data.paymentMethods || [],
        });
      } else {
        // PAY-08: log the raw upstream provider body server-side only; return a
        // generic message so PSP internal detail does not reach the caller.
        const err = await resp.text();
        console.error(`[adyen-payment] test_connection upstream ${resp.status}:`, err);
        return json({
          success: false,
          error: "Could not connect to H&L Pay. Check the venue's payment credentials and try again.",
        }, 400);
      }
    }

    // ═══ PAYMENT METHODS ═══ (Drop-in needs the raw payment-methods response)
    if (action === "payment_methods") {
      const clientKey =
        config.environment === "live" ? config.client_key_live : config.client_key_test;

      // PAY-05: surface the per-venue wallet identifiers so the Drop-in can be
      // configured with the venue's real Apple/Google Pay merchant ids instead of
      // hardcoded placeholders. `gatewayMerchantId` for Google-Pay-via-Adyen is the
      // venue's Adyen merchant account. PAY-07: also return the effective
      // environment so the client Drop-in initialises in the SAME environment the
      // server processes against (no test/live mismatch).
      const wallets = {
        applePayMerchantId: config.apple_pay_merchant_id || null,
        googlePayMerchantId: config.google_pay_merchant_id || null,
        gatewayMerchantId: merchantAccount || null,
      };

      if (isMock) {
        return json({
          ...MOCK_PAYMENT_METHODS,
          client_key: clientKey || null,
          wallets,
          environment: config.environment,
          mock_mode: true,
        });
      }

      if (!apiKey || !merchantAccount) return json({ error: "H&L Pay not configured" }, 400);

      const reqBody: any = {
        merchantAccount,
        countryCode: body.country_code || config.country_code || "AU",
        amount: {
          value: Math.round((body.amount || 0) * 100),
          currency: body.currency || config.default_currency || "AUD",
        },
        channel: "Web",
      };
      if (body.shopper_reference) reqBody.shopperReference = body.shopper_reference;

      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(reqBody),
      });
      const result = await resp.json();
      // Always include the client_key + wallet config + environment so the Drop-in
      // can initialise consistently with the server.
      return json(
        { ...result, client_key: clientKey || null, wallets, environment: config.environment },
        resp.ok ? 200 : 400,
      );
    }

    // ═══ CREATE PAYMENT ═══
    if (action === "create_payment") {
      const {
        amount, currency, reference, return_url,
        store_card, shopper_reference, diner_id,
        stored_card_token,
        payment_method,   // From Adyen Drop-in
        browser_info,     // From Adyen Drop-in
      } = body;

      if (!amount || !reference) {
        return json({ error: "amount and reference required" }, 400);
      }

      // PAY-01: raw card data (PAN/CVV) must never reach or pass through our
      // servers. Card capture is exclusively the hosted Drop-in / wallets, which
      // send a tokenised `payment_method`. Reject any request carrying raw card
      // fields outright — this keeps the application in PCI DSS SAQ A scope and
      // closes the anonymous card-testing surface the raw-card path created.
      if (body.card) {
        return json({ error: "Raw card data is not accepted" }, 400);
      }

      // PAY-02: a stored card may only be charged by the authenticated diner who
      // owns it (or by venue staff). Without this, any caller could charge another
      // diner's saved card using its token + the predictable shopper_reference.
      // Mirrors the ownership gate already enforced on list/delete stored cards.
      if (stored_card_token) {
        if (!userId) {
          return json({ error: "Authentication required" }, 401);
        }
        const { data: storedCard } = await adminClient
          .from("diner_stored_cards")
          .select("diner_id")
          .eq("venue_id", venue_id)
          .eq("token_reference", stored_card_token)
          .maybeSingle();
        if (!storedCard) {
          return json({ error: "Stored card not found" }, 404);
        }
        const { data: ownerProfile } = await adminClient
          .from("diner_profiles")
          .select("id")
          .eq("id", storedCard.diner_id)
          .eq("user_id", userId)
          .maybeSingle();
        let ownsCard = !!ownerProfile;
        if (!ownsCard) {
          const { data: isStaff } = await adminClient.rpc("is_venue_manager", {
            _user_id: userId,
            _venue_id: venue_id,
          });
          ownsCard = !!isStaff;
        }
        if (!ownsCard) {
          return json({ error: "Not authorized to use this stored card" }, 403);
        }
      }

      // AEA-05/AEA-02: rate-limit the live-charge path. It is callable with only
      // the anon key (guest checkout), so without this it is a card-testing /
      // BIN-attack surface against the live Adyen endpoint. Limit per IP and per
      // venue; mock mode is exempt (no real charge, no cost).
      if (!isMock) {
        const ip = getClientIp(req);
        const rl = await enforceRateLimit(adminClient, [
          { key: `adyen-create-payment:ip:${ip}`, limit: 10, windowSec: 600 },
          { key: `adyen-create-payment:venue:${venue_id}`, limit: 60, windowSec: 600 },
        ], { failClosed: true }); // live-charge path — deny if the limiter is unavailable
        if (!rl.allowed) return tooManyRequests(corsHeaders);
      }

      // HLRDRNW-68 · IVA-01 — bind the charged amount to the server-authoritative
      // order total. orders.total is enforced by the pricing triggers
      // (enforce_order_item_pricing / recompute_order_total), so a client can no
      // longer be charged an amount it invented for an underpriced order. Only the
      // real-charge path is enforced, and only when the reference maps to one of
      // our orders. Over-payment is allowed (not an abuse vector); under-payment
      // beyond a 1-cent float tolerance is rejected.
      if (!isMock && typeof reference === "string" && reference.startsWith("order_")) {
        const boundOrderId = reference.slice("order_".length);
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boundOrderId)) {
          const { data: boundOrder } = await adminClient
            .from("orders")
            .select("total, venue_id")
            .eq("id", boundOrderId)
            .maybeSingle();
          if (!boundOrder) {
            return json({ error: "Order not found" }, 400);
          }
          if (venue_id && boundOrder.venue_id !== venue_id) {
            return json({ error: "Order does not belong to this venue" }, 400);
          }
          const requestedMinor = Math.round(Number(amount) * 100);
          const authoritativeMinor = Math.round(Number(boundOrder.total) * 100);
          // Reject non-numeric / non-finite amounts outright — otherwise NaN
          // slips past the comparison below (NaN comparisons are always false).
          if (!Number.isFinite(requestedMinor) || !Number.isFinite(authoritativeMinor)) {
            return json({ error: "Invalid payment amount" }, 400);
          }
          // Exact match to the server-authoritative order total (1-cent float
          // tolerance) — rejects both under-payment and over-charging the diner.
          if (Math.abs(requestedMinor - authoritativeMinor) > 1) {
            console.warn(
              `adyen create_payment amount mismatch: requested=${requestedMinor} authoritative=${authoritativeMinor} order=${boundOrderId}`
            );
            return json({ error: "Payment amount does not match the order total" }, 400);
          }
        }
      }

      let result: any;

      if (isMock) {
        await new Promise((r) => setTimeout(r, 500));
        result = mockPayment(body);
      } else {
        if (!apiKey || !merchantAccount) return json({ error: "Not configured" }, 400);

        const paymentRequest: any = {
          merchantAccount,
          amount: { value: Math.round(amount * 100), currency: currency || config.default_currency || "AUD" },
          reference,
          returnUrl: return_url || `${supabaseUrl}/payment-complete`,
          channel: "Web",
          origin: origin || undefined,
          shopperIP,
        };

        // Honour venue capture mode — manual = authorise now, capture later
        if (config.capture_mode === "manual") {
          paymentRequest.captureDelayHours = 0;
          paymentRequest.additionalData = {
            ...(paymentRequest.additionalData || {}),
            manualCapture: "true",
          };
        }

        if (browser_info) paymentRequest.browserInfo = browser_info;

        if (stored_card_token && shopper_reference) {
          // Stored card (one-click) — server-built paymentMethod
          paymentRequest.paymentMethod = {
            type: "scheme",
            storedPaymentMethodId: stored_card_token,
          };
          paymentRequest.shopperReference = shopper_reference;
          paymentRequest.shopperInteraction = "ContAuth";
          paymentRequest.recurringProcessingModel = "CardOnFile";
        } else if (payment_method) {
          // Drop-in flow — pass through whatever Drop-in produced
          // (encrypted card, applepay token, googlepay token, etc.)
          paymentRequest.paymentMethod = payment_method;
          if (shopper_reference) paymentRequest.shopperReference = shopper_reference;
          if (store_card && shopper_reference) {
            paymentRequest.storePaymentMethod = true;
            paymentRequest.recurringProcessingModel = "CardOnFile";
            paymentRequest.shopperInteraction = "Ecommerce";
          }
        } else {
          return json({ error: "No payment method provided" }, 400);
        }

        // AEA-05: forward an Adyen Idempotency-Key. A double-submit or client
        // retry with the same reference+amount returns the original result
        // instead of issuing a second (duplicate) charge. The amount is included
        // so that a legitimate re-payment of the same reference for a *different*
        // amount is not incorrectly replayed as the original charge.
        const idempotencyKey = `${reference}:${Math.round(Number(amount) * 100)}`;
        const resp = await fetch(`${baseUrl}/payments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(paymentRequest),
        });
        result = await resp.json();
      }

      // Save stored card token if payment authorised and store requested.
      // Require authentication + verified ownership of the diner profile before
      // we write a stored card to it (prevents IDOR / mock-mode token planting).
      let canStoreCard = false;
      if (result.resultCode === "Authorised" && store_card && diner_id && result.additionalData) {
        if (!userId) {
          canStoreCard = false;
        } else {
          const { data: ownerProfile } = await adminClient
            .from("diner_profiles")
            .select("id")
            .eq("id", diner_id)
            .eq("user_id", userId)
            .maybeSingle();
          canStoreCard = !!ownerProfile;
        }
      }
      if (canStoreCard) {
        const tokenRef =
          result.additionalData["recurring.recurringDetailReference"] ||
          result.additionalData?.["recurring.shopperReference"];
        const cardSummary = result.additionalData?.cardSummary;
        const cardBrand = result.additionalData?.paymentMethod || result.paymentMethod?.brand;

        if (tokenRef) {
          await adminClient.from("diner_stored_cards").insert({
            diner_id,
            venue_id,
            provider: "adyen",
            token_reference: tokenRef,
            shopper_reference: shopper_reference,
            card_summary: cardSummary,
            card_brand: cardBrand,
            is_default: true,
          });

          await adminClient
            .from("diner_stored_cards")
            .update({ is_default: false })
            .eq("diner_id", diner_id)
            .eq("venue_id", venue_id)
            .neq("token_reference", tokenRef);
        }
      }

      // If authorised, stamp the order with the PSP reference and (when in mock
      // mode) flag it so operators see a clear DEMO badge instead of treating
      // it as real revenue.
      if (result.resultCode === "Authorised" && reference?.startsWith("order_")) {
        const orderId = reference.slice("order_".length);
        const stamp: any = {};
        if (result.pspReference) stamp.payment_psp_reference = result.pspReference;
        if (isMock) stamp.payment_is_mock = true;
        if (Object.keys(stamp).length > 0) {
          await adminClient.from("orders").update(stamp).eq("id", orderId);
        }
      }

      // Strip Adyen additionalData (BIN/card metadata, internal fields) before
      // returning to the browser; the Drop-in only needs resultCode/action/pspReference.
      const { additionalData: _ad, ...safeResult } = (result ?? {}) as Record<string, unknown>;
      return json({ ...safeResult, mock_mode: isMock });
    }

    // ═══ PAYMENT DETAILS (3DS) ═══
    if (action === "payment_details") {
      if (isMock) {
        return json({ resultCode: "Authorised", pspReference: `MOCK_3DS_${Date.now()}`, mock_mode: true });
      }
      if (!apiKey || !merchantAccount) return json({ error: "Not configured" }, 400);
      const resp = await fetch(`${baseUrl}/payments/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ details: body.details }),
      });
      const result = await resp.json();
      const { additionalData: _ad2, ...safeResult } = (result ?? {}) as Record<string, unknown>;
      return json(safeResult, resp.ok ? 200 : 400);
    }

    // ═══ LIST STORED CARDS ═══
    if (action === "list_stored_cards") {
      const { diner_id } = body;
      if (!diner_id) return json({ error: "diner_id required" }, 400);
      if (!userId) return json({ error: "Authentication required" }, 401);

      // Verify caller owns this diner profile (or is venue staff)
      const { data: profile } = await adminClient
        .from("diner_profiles")
        .select("id, user_id")
        .eq("id", diner_id)
        .maybeSingle();
      const { data: isStaff } = await adminClient.rpc("is_venue_manager", {
        _user_id: userId,
        _venue_id: venue_id,
      });
      if (!isStaff && profile?.user_id !== userId) {
        return json({ error: "Not authorized" }, 403);
      }

      const { data: cards } = await adminClient
        .from("diner_stored_cards")
        .select("*")
        .eq("diner_id", diner_id)
        .eq("venue_id", venue_id)
        .eq("provider", "adyen")
        .order("is_default", { ascending: false });

      return json({ cards: cards || [] });
    }

    // ═══ DELETE STORED CARD ═══
    if (action === "delete_stored_card") {
      const { card_id, diner_id } = body;
      if (!card_id || !diner_id) return json({ error: "card_id and diner_id required" }, 400);
      if (!userId) return json({ error: "Authentication required" }, 401);

      // Verify caller owns this diner profile (or is venue staff)
      const { data: profile } = await adminClient
        .from("diner_profiles")
        .select("id, user_id")
        .eq("id", diner_id)
        .maybeSingle();
      const { data: isStaff } = await adminClient.rpc("is_venue_manager", {
        _user_id: userId,
        _venue_id: venue_id,
      });
      if (!isStaff && profile?.user_id !== userId) {
        return json({ error: "Not authorized" }, 403);
      }

      await adminClient
        .from("diner_stored_cards")
        .delete()
        .eq("id", card_id)
        .eq("diner_id", diner_id);

      return json({ success: true });
    }

    // ═══ REFUND ═══
    // Re-open & refund a (partially) closed order via H&L Pay.
    // Body: { venue_id, order_id, amount, reason? }
    if (action === "refund") {
      const { order_id, amount, reason } = body;
      if (!order_id || !amount || amount <= 0) {
        return json({ error: "order_id and positive amount are required" }, 400);
      }
      if (!userId) {
        return json({ error: "Authentication required" }, 401);
      }

      // Authorize: the caller must be able to refund THIS venue's orders.
      // Without this check any authenticated user could refund any venue's
      // order by supplying its venue_id/order_id (cross-tenant financial
      // action). We mirror the frontend permission model (use-permissions.ts):
      // owners/managers always qualify, and any active staff member whose
      // per-user `venue_staff.can_process_refunds` flag is set also qualifies.
      const { data: isMgr } = await adminClient.rpc("is_venue_manager", {
        _user_id: userId,
        _venue_id: venue_id,
      });
      let authorized = !!isMgr;
      if (!authorized) {
        const { data: staffRow } = await adminClient
          .from("venue_staff")
          .select("can_process_refunds, is_active")
          .eq("user_id", userId)
          .eq("venue_id", venue_id)
          .maybeSingle();
        authorized = !!(staffRow?.is_active && staffRow?.can_process_refunds);
      }
      if (!authorized) {
        return json({ error: "Not authorized" }, 403);
      }

      // Look up the original payment reference
      const { data: order } = await adminClient
        .from("orders")
        .select("id, total, payment_psp_reference, venue_id")
        .eq("id", order_id)
        .eq("venue_id", venue_id)
        .maybeSingle();

      if (!order) return json({ error: "Order not found" }, 404);

      // PAY-04: bound the refund to the REMAINING refundable balance (order total
      // minus refunds already recorded for this order), not just the order total.
      // Otherwise repeated refunds could each be up to the full total and
      // collectively exceed what was charged.
      const { data: priorRefunds } = await adminClient
        .from("order_refunds")
        .select("amount")
        .eq("order_id", order_id);
      const alreadyRefunded = (priorRefunds || []).reduce(
        (sum: number, r: any) => sum + Number(r.amount || 0),
        0,
      );
      const remainingRefundable = Number(order.total) - alreadyRefunded;
      if (remainingRefundable <= 0) {
        return json({ error: "This order has already been fully refunded" }, 400);
      }
      const requestedRefundCents = Math.round(Number(amount) * 100);
      const remainingRefundableCents = Math.round(remainingRefundable * 100);
      if (requestedRefundCents > remainingRefundableCents) {
        return json({ error: "Refund amount exceeds the remaining refundable balance" }, 400);
      }

      // Mock mode — instant success
      if (isMock) {
        return json({
          pspReference: `MOCK_REFUND_${Date.now()}`,
          status: "received",
          amount,
          reason: reason || null,
        });
      }

      if (!order.payment_psp_reference) {
        return json({
          error: "This order has no recorded H&L Pay payment reference and cannot be refunded automatically. Please process this refund manually.",
        }, 400);
      }

      if (!apiKey || !merchantAccount) {
        return json({ error: "H&L Pay not configured for this venue" }, 400);
      }

      // PAY-04: deterministic idempotency key so a double-submit / client retry
      // returns the original refund instead of issuing a second one. Including the
      // remaining balance means a *legitimate* later refund of the same amount
      // (now against a smaller balance) produces a distinct key and is not blocked.
      const refundCents = Math.round(Number(amount) * 100);
      const remainingCents = Math.round(remainingRefundable * 100);
      const refundIdempotencyKey = `refund:${order_id}:${refundCents}:${remainingCents}`;

      const refundResp = await fetch(
        `${baseUrl}/payments/${order.payment_psp_reference}/refunds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "Idempotency-Key": refundIdempotencyKey,
          },
          body: JSON.stringify({
            merchantAccount,
            amount: {
              value: refundCents,
              currency: config.default_currency || "AUD",
            },
            // Include remainingCents (as in the idempotency key) so two legitimate
            // same-amount partial refunds get distinct references for reconciliation,
            // while a true double-submit reuses the same reference and is deduped.
            reference: `REFUND_${order_id}_${refundCents}_${remainingCents}`,
            merchantRefundReason: reason || "Requested by venue",
          }),
        },
      );

      const refundResult = await refundResp.json();
      if (!refundResp.ok) {
        // PAY-08: log the upstream body server-side only; return a generic message.
        console.error(`[adyen-payment] refund upstream ${refundResp.status}:`, JSON.stringify(refundResult));
        return json({ error: "H&L Pay refund failed" }, 400);
      }

      return json({
        pspReference: refundResult.pspReference,
        status: refundResult.status || "received",
        amount,
        reason: reason || null,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    return safeErrorResponse("adyen-payment", err, corsHeaders, 500, "H&L Pay processing error");
  }
});
