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

    // Vault is the only home for these — the plaintext columns are gone.
    //
    // A failed lookup must NOT be reported as "no secret configured". supabase-js
    // returns RPC failures in `error` rather than throwing, so discarding it made a
    // Vault outage or permissions regression indistinguishable from an unconfigured
    // venue — which drops a correctly-configured test venue into mock mode, where
    // payments are simulated as Authorised and orders finalise as paid without any
    // authorisation reaching the processor. Fail the request instead; the outer
    // handler turns this into a generic 500 with a correlation id.
    const loadSecret = async (field: string): Promise<string | null> => {
      const { data, error } = await adminClient.rpc("get_payment_secret", {
        _venue_id: venue_id,
        _field: field,
      });
      if (error) {
        console.error(`[adyen-payment] secret lookup failed for ${field}`, error);
        throw new Error(`secret lookup failed for ${field}`);
      }
      return (data as string) || null;
    };
    const [vaultApiTest, vaultApiLive, vaultCkTest, vaultCkLive, vaultHmac] = await Promise.all([
      loadSecret("api_key_test"),
      loadSecret("api_key_live"),
      loadSecret("client_key_test"),
      loadSecret("client_key_live"),
      loadSecret("hmac_key"),
    ]);
    config.api_key_test    = vaultApiTest;
    config.api_key_live    = vaultApiLive;
    config.client_key_test = vaultCkTest;
    config.client_key_live = vaultCkLive;
    config.hmac_key        = vaultHmac;


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
      // owns it (or by venue owners/managers). Without this, any caller could charge another
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
          // The diner is at the checkout choosing this saved card, so the
          // transaction is shopper-initiated: Ecommerce, not ContAuth. ContAuth
          // declares a merchant-initiated charge with the shopper absent (e.g. a
          // subscription renewal), which mis-states the transaction to the issuer:
          // it can skip SCA where it should apply, shift chargeback liability away
          // from the issuer, and be refused by issuers expecting a prior
          // shopper-initiated payment on file.
          paymentRequest.shopperInteraction = "Ecommerce";
          paymentRequest.recurringProcessingModel = "CardOnFile";
        } else if (payment_method) {
          // Drop-in flow — pass through whatever Drop-in produced
          // (encrypted card, applepay token, googlepay token, etc.)
          paymentRequest.paymentMethod = payment_method;
          if (shopper_reference) paymentRequest.shopperReference = shopper_reference;
          // The shopper is present and entering their card now, so this is always
          // an Ecommerce interaction. Adyen requires shopperInteraction whenever a
          // shopperReference is supplied — and we always supply one — so omitting
          // it refused every payment with "217 Field 'shopperInteraction' is
          // missing or not valid". It used to be set only on the store-card path,
          // which meant no guest payment (store_card=false) could ever succeed.
          paymentRequest.shopperInteraction = "Ecommerce";
          if (store_card && shopper_reference) {
            paymentRequest.storePaymentMethod = true;
            paymentRequest.recurringProcessingModel = "CardOnFile";
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
      //
      // HLRDRNW-19: payment_status is stamped HERE and nowhere else. The browser
      // used to insert the order with payment_status='paid' before the payment
      // was even attempted, and then tried to write status='paid' itself — a
      // write RLS denies. So the row claimed paid on a refusal and never showed
      // as paid on success. The amount was already bound to the
      // server-authoritative order total by IVA-01 above, so authorisation here
      // is the only place that knows the money actually moved.
      if (result.resultCode === "Authorised" && reference?.startsWith("order_")) {
        const orderId = reference.slice("order_".length);
        const stamp: any = { payment_status: "paid" };
        if (result.pspReference) stamp.payment_psp_reference = result.pspReference;
        if (isMock) stamp.payment_is_mock = true;
        const { error: stampErr } = await adminClient
          .from("orders")
          .update(stamp)
          .eq("id", orderId);
        // The card has been charged at this point. Log loudly rather than
        // failing the response: the diner must still get their confirmation,
        // and a stamp that did not land is a reconciliation problem
        // (HLRDRNW-29), not a reason to tell them the payment failed.
        if (stampErr) {
          console.error(
            `adyen create_payment: order ${orderId} authorised but payment_status stamp failed`,
            stampErr,
          );
        }
      }

      // Tab payments are recorded here, not by the browser. Previously the
      // client inserted its own row into tab_payments, so a diner could claim
      // to have paid without paying: get_tab_summary counts rows with
      // status IN ('paid','authorised') toward balance_due, and settle_tab()
      // then closed the tab. The amount written below is the amount we actually
      // sent to Adyen and Adyen authorised, so it cannot overstate what moved.
      // Same treatment IVA-01 gave order pricing.
      if (
        result.resultCode === "Authorised" &&
        (reference?.startsWith("tab_") || reference?.startsWith("preauth_"))
      ) {
        const isPreauth = reference.startsWith("preauth_");
        // tab_<uuid>_<timestamp>   |   preauth_<uuid>
        const tabId = reference
          .slice((isPreauth ? "preauth_" : "tab_").length)
          .split("_")[0];

        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tabId)) {
          try {
            const { data: boundTab } = await adminClient
              .from("table_tabs")
              .select("id, venue_id, status")
              .eq("id", tabId)
              .maybeSingle();

            // Cross-tenant guard, mirroring the order path.
            if (boundTab && (!venue_id || boundTab.venue_id === venue_id)) {
              // Idempotency: never double-credit the same PSP capture if the
              // Drop-in retries or 3DS replays the call.
              //
              // This is enforced by uq_tab_payments_psp_reference rather than by
              // checking first. A SELECT-then-INSERT is not atomic — two
              // concurrent replays can both pass the check and insert. Letting
              // the unique index reject the second one closes that race, so a
              // 23505 here means "already recorded", not a failure.
              const { error: insertErr } = await adminClient.from("tab_payments").insert({
                tab_id: boundTab.id,
                venue_id: boundTab.venue_id,
                method: "card",
                amount: Number(amount),
                status: isPreauth ? "authorised" : "paid",
                psp_reference: result.pspReference || null,
                payer_diner_id: diner_id ?? null,
                is_mock: isMock,
              });
              if (insertErr && insertErr.code !== "23505") throw insertErr;

              if (isPreauth) {
                const { error: tabUpdateErr } = await adminClient
                  .from("table_tabs")
                  .update({
                    preauth_status: "authorised",
                    preauth_psp_reference: result.pspReference || null,
                  })
                  .eq("id", boundTab.id);
                if (tabUpdateErr) throw tabUpdateErr;
              }
            }
          } catch (e) {
            // The charge succeeded; do not tell the diner it failed. Surface it
            // for reconciliation instead — staff can apply the payment manually
            // from the Open Tabs panel using the PSP reference.
            console.error("tab payment recording failed", {
              reference,
              psp_reference: result.pspReference,
              error: String(e),
            });
          }
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
      // `paymentData` ties this completion back to the original /payments call.
      // Without it Adyen cannot resolve the challenge, so every 3DS redirect and
      // challenge flow stalled after the shopper authenticated. Forwarded only
      // when present — native-3DS completions may omit it.
      const detailsRequest: any = { details: body.details };
      if (body.payment_data) detailsRequest.paymentData = body.payment_data;
      const resp = await fetch(`${baseUrl}/payments/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(detailsRequest),
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
      const { order_id, amount, reason, refund_request_id } = body;
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

      // Normalise the requested amount to integer cents up front. All balance
      // arithmetic below stays in cents: summing dollar floats and converting
      // afterwards can drift, e.g. 100.00 - (33.33 + 33.33 + 33.34) lands on
      // 1.4e-14 rather than 0.
      const requestedRefundCents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(requestedRefundCents) || requestedRefundCents <= 0) {
        return json({ error: "Refund amount must be a valid positive number" }, 400);
      }

      // PAY-04: stable per-refund idempotency id supplied by the client (see
      // RefundDialog), with a server-generated fallback for other callers.
      const refundRequestId =
        typeof refund_request_id === "string" && refund_request_id.length > 0
          ? refund_request_id
          : crypto.randomUUID();
      if (refundRequestId.length > 128) {
        return json({ error: "refund_request_id is too long" }, 400);
      }

      // PAY-04 (retry replay): if this exact refund id was already processed AND
      // logged, return the original result rather than refunding again. Without
      // this, retrying a refund that succeeded but whose response was lost is
      // rejected by the balance check below — the remaining balance already
      // reflects it — so the operator sees a failure for a refund that went
      // through, and the stable-id retry path is dead in the case it exists for.
      //
      // Note this deliberately does NOT work by excluding this id from the balance
      // sum below. On a nullable column `request_id <> $1` evaluates to NULL for
      // legacy rows, which would drop every pre-request_id refund from the total and
      // reopen the over-refunding hole. Replaying from our own log also avoids
      // depending on how long Adyen retains an idempotency key.
      const { data: priorAttempt } = await adminClient
        .from("order_refunds")
        .select("amount, psp_reference, status")
        .eq("order_id", order_id)
        .eq("request_id", refundRequestId)
        .maybeSingle();
      if (priorAttempt) {
        return json({
          pspReference: (priorAttempt as any).psp_reference,
          status: (priorAttempt as any).status || "received",
          amount: Number((priorAttempt as any).amount),
          reason: reason || null,
          refund_request_id: refundRequestId,
          replayed: true,
        });
      }

      // PAY-04: bound the refund to the REMAINING refundable balance (order total
      // minus refunds already recorded for this order), not just the order total.
      // Otherwise repeated refunds could each be up to the full total and
      // collectively exceed what was charged. EVERY prior refund counts here,
      // including legacy rows with a NULL request_id.
      const { data: priorRefunds } = await adminClient
        .from("order_refunds")
        .select("amount")
        .eq("order_id", order_id);
      const alreadyRefundedCents = (priorRefunds || []).reduce(
        (sum: number, r: any) => sum + Math.round(Number(r.amount || 0) * 100),
        0,
      );
      const orderTotalCents = Math.round(Number(order.total) * 100);
      if (!Number.isFinite(orderTotalCents) || orderTotalCents <= 0) {
        return json({ error: "Invalid order total" }, 500);
      }
      const remainingRefundableCents = orderTotalCents - alreadyRefundedCents;
      if (remainingRefundableCents <= 0) {
        return json({ error: "This order has already been fully refunded" }, 400);
      }
      if (requestedRefundCents > remainingRefundableCents) {
        return json({ error: "Refund amount exceeds the remaining refundable balance" }, 400);
      }

      // PAY-04: record the refund HERE, in the same handler that calls the provider
      // and that computes the refundable balance above. Previously the only writer
      // was the browser (RefundDialog), which meant the balance the server enforces
      // was derived from a log the server did not control:
      //   * a client crash/timeout after the provider succeeded left the refund
      //     unrecorded, so a later refund could exceed the true balance; and
      //   * the RLS insert policy on order_refunds is is_venue_manager-only, while
      //     this handler also authorises staff holding `can_process_refunds` — for
      //     those users the insert was rejected EVERY time, so the money moved, the
      //     operator was shown "Refund failed", and nothing was logged.
      // Writing through adminClient (service role) bypasses RLS, and the unique
      // index on request_id makes a repeat call a no-op rather than a duplicate row.
      const logRefund = async (pspReference: string | null, status: string) => {
        const { error: logErr } = await adminClient
          .from("order_refunds")
          .upsert({
            order_id: order_id,
            venue_id: venue_id,
            amount: requestedRefundCents / 100,
            reason: reason || null,
            psp_reference: pspReference,
            status,
            requested_by: userId,
            request_id: refundRequestId,
          } as any, { onConflict: "request_id", ignoreDuplicates: true });
        if (logErr) {
          // The money has already moved; failing the response would tell the operator
          // the refund did not happen. Surface it in logs and still report success —
          // the balance may under-count until reconciled, which is why this is an
          // error-level log.
          console.error("[adyen-payment] FAILED to log refund", refundRequestId, logErr);
        }
      };

      // Mock mode — instant success
      if (isMock) {
        const mockPspReference = `MOCK_REFUND_${Date.now()}`;
        await logRefund(mockPspReference, "received");
        return json({
          pspReference: mockPspReference,
          status: "received",
          amount,
          reason: reason || null,
          refund_request_id: refundRequestId,
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

      // PAY-04: `refundRequestId` (validated above) is the STABLE per-refund
      // idempotency key. A retry that reaches Adyen — i.e. the first attempt
      // succeeded upstream but was never logged, so the replay check above found
      // nothing — reuses the same key and Adyen deduplicates it. Two DISTINCT
      // refunds carry distinct ids, so neither is wrongly deduped. (The original
      // scheme derived the key from the mutable remaining balance, so a retry after
      // logging produced a NEW key and could issue a second refund.)
      const refundResp = await fetch(
        `${baseUrl}/payments/${order.payment_psp_reference}/refunds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "Idempotency-Key": refundRequestId,
          },
          body: JSON.stringify({
            merchantAccount,
            amount: {
              value: requestedRefundCents,
              currency: config.default_currency || "AUD",
            },
            // Stable per-refund reference (matches the idempotency key): a retry
            // reuses it and Adyen deduplicates; distinct refunds stay distinct.
            reference: `REFUND_${refundRequestId}`,
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

      const refundStatus = refundResult.status || "received";
      await logRefund(refundResult.pspReference || null, refundStatus);

      return json({
        pspReference: refundResult.pspReference,
        status: refundStatus,
        amount,
        reason: reason || null,
        refund_request_id: refundRequestId,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    return safeErrorResponse("adyen-payment", err, corsHeaders, 500, "H&L Pay processing error");
  }
});
