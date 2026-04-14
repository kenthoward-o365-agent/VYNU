import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ── OrdrPayments — Mock Responses ──
const MOCK_PAYMENT_METHODS = {
  paymentMethods: [
    { type: "scheme", name: "Credit Card", brands: ["visa", "mc", "amex"] },
    { type: "applepay", name: "Apple Pay" },
    { type: "googlepay", name: "Google Pay" },
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
  const cardNumber = body.card?.number?.replace(/\s/g, "") || "";
  const storedToken = body.stored_card_token;

  // Stored card always succeeds
  if (storedToken) {
    return {
      resultCode: "Authorised",
      pspReference: `MOCK_${Date.now()}`,
      merchantReference: body.reference,
      additionalData: {
        cardSummary: "1111",
        paymentMethod: "visa",
      },
    };
  }

  // Check test card mapping
  const testResult = MOCK_TEST_CARDS[cardNumber];
  const resultCode = testResult?.resultCode || "Authorised";
  const isAuthorised = resultCode === "Authorised";

  const response: any = {
    resultCode,
    pspReference: `MOCK_${Date.now()}`,
    merchantReference: body.reference,
  };

  if (!isAuthorised) {
    response.refusalReason = testResult?.refusalReason || "Refused";
  }

  // If storing card, return token info
  if (isAuthorised && body.store_card) {
    response.additionalData = {
      "recurring.recurringDetailReference": `MOCK_TOKEN_${Date.now()}`,
      "recurring.shopperReference": body.shopper_reference,
      cardSummary: cardNumber.slice(-4),
      paymentMethod: detectBrand(cardNumber),
    };
  } else if (isAuthorised) {
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

    const body = await req.json();
    const { action, venue_id } = body;

    if (!venue_id) return json({ error: "venue_id required" }, 400);

    // Fetch venue payment config
    const { data: config } = await adminClient
      .from("venue_payment_config")
      .select("*")
      .eq("venue_id", venue_id)
      .eq("provider", "adyen")
      .maybeSingle();

    if (!config) {
      return json({ error: "No payment configuration found for this venue" }, 404);
    }

    if (!config.is_active && action !== "test_connection") {
      return json({ error: "Payments are not enabled for this venue" }, 400);
    }

    const isMock = config.environment === "test" && !config.api_key_test;
    const isLiveAdyen = config.environment === "live" && !!config.api_key_live;
    const isTestAdyen = config.environment === "test" && !!config.api_key_test;

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
          message: "Mock mode active — no Adyen credentials needed. Test cards will simulate payments.",
        });
      }

      if (!apiKey || !merchantAccount) {
        return json({ error: "Adyen API key or merchant account not configured" }, 400);
      }

      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({
          merchantAccount,
          countryCode: "AU",
          amount: { value: 0, currency: "AUD" },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const methods = (data.paymentMethods || []).map((m: any) => m.name || m.type);
        return json({ success: true, message: `Connected. Available methods: ${methods.join(", ")}` });
      } else {
        const err = await resp.text();
        return json({ success: false, error: `Adyen returned ${resp.status}: ${err}` }, 400);
      }
    }

    // ═══ PAYMENT METHODS ═══
    if (action === "payment_methods") {
      if (isMock) {
        return json(MOCK_PAYMENT_METHODS);
      }

      if (!apiKey || !merchantAccount) return json({ error: "Not configured" }, 400);

      const reqBody: any = {
        merchantAccount,
        countryCode: "AU",
        amount: { value: Math.round((body.amount || 0) * 100), currency: body.currency || "AUD" },
        channel: "Web",
      };
      if (body.shopper_reference) reqBody.shopperReference = body.shopper_reference;

      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(reqBody),
      });
      const result = await resp.json();
      return json(result, resp.ok ? 200 : 400);
    }

    // ═══ CREATE PAYMENT ═══
    if (action === "create_payment") {
      const {
        amount, currency, reference, return_url, card,
        store_card, shopper_reference, diner_id,
        stored_card_token,
      } = body;

      if (!amount || !reference) {
        return json({ error: "amount and reference required" }, 400);
      }

      let result: any;

      if (isMock) {
        // Simulate a 500ms processing delay for realism
        await new Promise((r) => setTimeout(r, 500));
        result = mockPayment(body);
      } else {
        if (!apiKey || !merchantAccount) return json({ error: "Not configured" }, 400);

        const paymentRequest: any = {
          merchantAccount,
          amount: { value: Math.round(amount * 100), currency: currency || "AUD" },
          reference,
          returnUrl: return_url || `${supabaseUrl}/payment-complete`,
          channel: "Web",
        };

        if (stored_card_token && shopper_reference) {
          paymentRequest.paymentMethod = { type: "scheme", storedPaymentMethodId: stored_card_token };
          paymentRequest.shopperReference = shopper_reference;
          paymentRequest.shopperInteraction = "ContAuth";
          paymentRequest.recurringProcessingModel = "CardOnFile";
        } else if (card) {
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

      return json(result);
    }

    // ═══ PAYMENT DETAILS (3DS) ═══
    if (action === "payment_details") {
      if (isMock) {
        return json({ resultCode: "Authorised", pspReference: `MOCK_3DS_${Date.now()}` });
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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("adyen-payment error:", err);
    return json({ error: err.message }, 500);
  }
});
