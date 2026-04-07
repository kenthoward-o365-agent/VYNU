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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth is optional for consumer flows (anon can place orders)
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
      return json({ error: "No Adyen configuration found for this venue" }, 404);
    }

    if (!config.is_active && action !== "test_connection") {
      return json({ error: "Payments are not enabled for this venue" }, 400);
    }

    const apiKey = config.environment === "live" ? config.api_key_live : config.api_key_test;
    const merchantAccount = config.merchant_account;

    if (!apiKey || !merchantAccount) {
      return json({ error: "Adyen API key or merchant account not configured" }, 400);
    }

    const baseUrl = config.environment === "live"
      ? "https://checkout-live.adyen.com/v71"
      : "https://checkout-test.adyen.com/v71";

    // ── TEST CONNECTION ──
    if (action === "test_connection") {
      if (!userId) return json({ error: "Not authenticated" }, 401);
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

    // ── GET PAYMENT METHODS ──
    if (action === "payment_methods") {
      const { amount, currency, shopper_reference } = body;

      const reqBody: any = {
        merchantAccount,
        countryCode: "AU",
        amount: { value: Math.round((amount || 0) * 100), currency: currency || "AUD" },
        channel: "Web",
      };

      if (shopper_reference) {
        reqBody.shopperReference = shopper_reference;
      }

      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(reqBody),
      });

      const result = await resp.json();
      return json(result, resp.ok ? 200 : 400);
    }

    // ── CREATE PAYMENT ──
    if (action === "create_payment") {
      const {
        amount, currency, reference, return_url, card,
        store_card, shopper_reference, diner_id,
        stored_card_token,
      } = body;

      if (!amount || !reference) {
        return json({ error: "amount and reference required" }, 400);
      }

      const paymentRequest: any = {
        merchantAccount,
        amount: {
          value: Math.round(amount * 100),
          currency: currency || "AUD",
        },
        reference,
        returnUrl: return_url || `${supabaseUrl}/payment-complete`,
        channel: "Web",
      };

      // If using a stored card token
      if (stored_card_token && shopper_reference) {
        paymentRequest.paymentMethod = {
          type: "scheme",
          storedPaymentMethodId: stored_card_token,
        };
        paymentRequest.shopperReference = shopper_reference;
        paymentRequest.shopperInteraction = "ContAuth";
        paymentRequest.recurringProcessingModel = "CardOnFile";
      }
      // If paying with new card details
      else if (card) {
        paymentRequest.paymentMethod = {
          type: "scheme",
          number: card.number?.replace(/\s/g, ""),
          expiryMonth: card.expiry_month,
          expiryYear: card.expiry_year,
          cvc: card.cvc,
          holderName: card.holder_name || "Customer",
        };

        // If user wants to store this card for future use
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

      const result = await resp.json();

      // If payment was successful and card was stored, save the token
      if (
        resp.ok &&
        result.resultCode === "Authorised" &&
        store_card &&
        diner_id &&
        result.additionalData
      ) {
        const tokenRef =
          result.additionalData["recurring.recurringDetailReference"] ||
          result.additionalData?.["recurring.shopperReference"];
        const cardSummary = result.additionalData?.cardSummary || card?.number?.slice(-4);
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

          // Un-default other cards for this diner at this venue
          await adminClient
            .from("diner_stored_cards")
            .update({ is_default: false })
            .eq("diner_id", diner_id)
            .eq("venue_id", venue_id)
            .neq("token_reference", tokenRef);
        }
      }

      return json(result, resp.ok ? 200 : 400);
    }

    // ── PAYMENT DETAILS (3DS) ──
    if (action === "payment_details") {
      const { details } = body;
      const resp = await fetch(`${baseUrl}/payments/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ details }),
      });
      const result = await resp.json();
      return json(result, resp.ok ? 200 : 400);
    }

    // ── LIST STORED CARDS ──
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

    // ── DELETE STORED CARD ──
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
