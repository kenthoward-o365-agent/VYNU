import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ── OrdrPay — Mock Responses ──
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
        merchantName: "OrdrPay (Test)",
      },
    },
    {
      type: "googlepay",
      name: "Google Pay",
      configuration: {
        merchantId: "MOCK_GOOGLEPAY",
        merchantName: "OrdrPay (Test)",
        gatewayMerchantId: "MOCK_GATEWAY",
      },
    },
  ],
};

const MOCK_TEST_CARDS: Record<string, { resultCode: string; refusalReason?: string }> = {
  "4111111111111111": { resultCode: "Authorised" },
  "5555341244441115": { resultCode: "Authorised" },
  "370000000000002":  { resultCode: "Authorised" },
  "4871049999990006": { resultCode: "Authorised" },
  "4000000000000002": { resultCode: "Refused", refusalReason: "Insufficient funds" },
};

function mockPayment(body: any) {
  // Stored card always succeeds (in mock, the saved token is itself simulated)
  if (body.stored_card_token) {
    return {
      resultCode: "Authorised",
      pspReference: `MOCK_${Date.now()}`,
      merchantReference: body.reference,
      additionalData: { cardSummary: "1111", paymentMethod: "visa" },
      mock_mode: true,
    };
  }

  // Drop-in payments — wallet tokens or encrypted card payloads.
  // In mock mode wallets are NOT supported (the diner-side UI disables those
  // buttons when mock_mode is true), so anything reaching here that claims to
  // be a wallet payment is rejected to avoid silent free orders.
  const pm = body.payment_method;
  if (pm) {
    return {
      resultCode: "Refused",
      refusalReason:
        "Simulated mode does not support wallet or encrypted card payments — use a listed test card number.",
      merchantReference: body.reference,
      mock_mode: true,
    };
  }

  // Legacy raw-card path — strict match against known test cards only.
  const cardNumber = body.card?.number?.replace(/\s/g, "") || "";
  const testResult = MOCK_TEST_CARDS[cardNumber];

  if (!testResult) {
    return {
      resultCode: "Refused",
      refusalReason:
        cardNumber.length === 0
          ? "No card number provided"
          : "Unknown test card — use 4111 1111 1111 1111 in simulated mode",
      merchantReference: body.reference,
      mock_mode: true,
    };
  }

  const resultCode = testResult.resultCode;
  const isAuthorised = resultCode === "Authorised";

  const response: any = {
    resultCode,
    pspReference: `MOCK_${Date.now()}`,
    merchantReference: body.reference,
    mock_mode: true,
  };

  if (!isAuthorised) {
    response.refusalReason = testResult.refusalReason || "Refused";
    return response;
  }

  if (body.store_card) {
    response.additionalData = {
      "recurring.recurringDetailReference": `MOCK_TOKEN_${Date.now()}`,
      "recurring.shopperReference": body.shopper_reference,
      cardSummary: cardNumber.slice(-4),
      paymentMethod: detectBrand(cardNumber),
    };
  } else {
    response.additionalData = {
      cardSummary: cardNumber.slice(-4),
      paymentMethod: detectBrand(cardNumber),
    };
  }

  return response;
}

function detectBrand(num: string): string {
  if (num.startsWith("4")) return "visa";
  if (num.startsWith("5")) return "mc";
  if (num.startsWith("3")) return "amex";
  return "card";
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

    if (!config.is_active && action !== "test_connection") {
      return json({ error: "Payments are not enabled for this venue" }, 400);
    }

    // Mock whenever we're in test mode AND the venue isn't fully provisioned
    // (no test API key, no client key, or merchant_account looks invalid).
    // This lets venues demo the full payment flow before OrdrPay credentials land.
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
          message: "OrdrPay test mode active — test cards will simulate payments.",
        });
      }

      if (!apiKey || !merchantAccount) {
        return json({ error: "OrdrPay account not yet provisioned for this venue" }, 400);
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
          message: `Connected to OrdrPay. Available methods: ${methods.join(", ")}`,
          methods: data.paymentMethods || [],
        });
      } else {
        const err = await resp.text();
        return json({ success: false, error: `OrdrPay returned ${resp.status}: ${err}` }, 400);
      }
    }

    // ═══ PAYMENT METHODS ═══ (Drop-in needs the raw payment-methods response)
    if (action === "payment_methods") {
      const clientKey =
        config.environment === "live" ? config.client_key_live : config.client_key_test;

      if (isMock) {
        return json({ ...MOCK_PAYMENT_METHODS, client_key: clientKey || null, mock_mode: true });
      }

      if (!apiKey || !merchantAccount) return json({ error: "OrdrPay not configured" }, 400);

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
      // Always include the client_key so the Drop-in can initialise
      return json({ ...result, client_key: clientKey || null }, resp.ok ? 200 : 400);
    }

    // ═══ CREATE PAYMENT ═══
    if (action === "create_payment") {
      const {
        amount, currency, reference, return_url, card,
        store_card, shopper_reference, diner_id,
        stored_card_token,
        payment_method,   // From Adyen Drop-in
        browser_info,     // From Adyen Drop-in
      } = body;

      if (!amount || !reference) {
        return json({ error: "amount and reference required" }, 400);
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
        } else if (card) {
          // Legacy raw-card path (kept for backwards compat / non-Drop-in clients)
          paymentRequest.paymentMethod = {
            type: "scheme",
            number: card.number?.replace(/\s/g, ""),
            expiryMonth: card.expiry_month,
            expiryYear: card.expiry_year,
            cvc: card.cvc,
            holderName: card.holder_name || "Customer",
          };
          if (store_card && shopper_reference) {
            paymentRequest.shopperReference = shopper_reference;
            paymentRequest.storePaymentMethod = true;
            paymentRequest.recurringProcessingModel = "CardOnFile";
            paymentRequest.shopperInteraction = "Ecommerce";
          }
        } else {
          return json({ error: "No payment method provided" }, 400);
        }

        const resp = await fetch(`${baseUrl}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify(paymentRequest),
        });
        result = await resp.json();
      }

      // Save stored card token if payment authorised and store requested
      if (
        result.resultCode === "Authorised" &&
        store_card &&
        diner_id &&
        result.additionalData
      ) {
        const tokenRef =
          result.additionalData["recurring.recurringDetailReference"] ||
          result.additionalData?.["recurring.shopperReference"];
        const cardSummary = result.additionalData?.cardSummary || card?.number?.replace(/\s/g, "").slice(-4);
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
            expiry_month: card?.expiry_month,
            expiry_year: card?.expiry_year,
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

      return json({ ...result, mock_mode: isMock });
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
      return json(result, resp.ok ? 200 : 400);
    }

    // ═══ LIST STORED CARDS ═══
    if (action === "list_stored_cards") {
      const { diner_id } = body;
      if (!diner_id) return json({ error: "diner_id required" }, 400);

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

      await adminClient
        .from("diner_stored_cards")
        .delete()
        .eq("id", card_id)
        .eq("diner_id", diner_id);

      return json({ success: true });
    }

    // ═══ REFUND ═══
    // Re-open & refund a (partially) closed order via OrdrPay.
    // Body: { venue_id, order_id, amount, reason? }
    if (action === "refund") {
      const { order_id, amount, reason } = body;
      if (!order_id || !amount || amount <= 0) {
        return json({ error: "order_id and positive amount are required" }, 400);
      }
      if (!userId) {
        return json({ error: "Authentication required" }, 401);
      }

      // Look up the original payment reference
      const { data: order } = await adminClient
        .from("orders")
        .select("id, total, payment_psp_reference, venue_id")
        .eq("id", order_id)
        .eq("venue_id", venue_id)
        .maybeSingle();

      if (!order) return json({ error: "Order not found" }, 404);

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
          error: "This order has no recorded OrdrPay payment reference and cannot be refunded automatically. Please process this refund manually.",
        }, 400);
      }

      if (!apiKey || !merchantAccount) {
        return json({ error: "OrdrPay not configured for this venue" }, 400);
      }

      const refundResp = await fetch(
        `${baseUrl}/payments/${order.payment_psp_reference}/refunds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify({
            merchantAccount,
            amount: {
              value: Math.round(Number(amount) * 100),
              currency: config.default_currency || "AUD",
            },
            reference: `REFUND_${order_id}_${Date.now()}`,
            merchantRefundReason: reason || "Requested by venue",
          }),
        },
      );

      const refundResult = await refundResp.json();
      if (!refundResp.ok) {
        return json({
          error: refundResult?.message || "OrdrPay refund failed",
          details: refundResult,
        }, 400);
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
    console.error("ordrpay error:", err);
    return json({ error: err.message || "OrdrPay processing error" }, 500);
  }
});
