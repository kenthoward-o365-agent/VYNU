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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const { action, venue_id } = body;

    if (!venue_id) return json({ error: "venue_id required" }, 400);

    // Fetch venue payment config using service role (to bypass RLS for reading)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: config } = await adminClient
      .from("venue_payment_config")
      .select("*")
      .eq("venue_id", venue_id)
      .eq("provider", "adyen")
      .maybeSingle();

    if (!config) {
      return json({ error: "No Adyen configuration found for this venue" }, 404);
    }

    const apiKey =
      config.environment === "live" ? config.api_key_live : config.api_key_test;
    const merchantAccount = config.merchant_account;

    if (!apiKey || !merchantAccount) {
      return json(
        { error: "Adyen API key or merchant account not configured" },
        400
      );
    }

    const baseUrl =
      config.environment === "live"
        ? "https://checkout-live.adyen.com/v71"
        : "https://checkout-test.adyen.com/v71";

    // ── TEST CONNECTION ──
    if (action === "test_connection") {
      // Use /paymentMethods to verify connectivity
      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          merchantAccount,
          countryCode: "AU",
          amount: { value: 0, currency: "AUD" },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const methods = (data.paymentMethods || []).map(
          (m: any) => m.name || m.type
        );
        return json({
          success: true,
          message: `Connected. Available methods: ${methods.join(", ")}`,
        });
      } else {
        const err = await resp.text();
        return json({ success: false, error: `Adyen returned ${resp.status}: ${err}` }, 400);
      }
    }

    // ── CREATE PAYMENT ──
    if (action === "create_payment") {
      const { amount, currency, reference, return_url, card } = body;

      if (!amount || !reference) {
        return json({ error: "amount and reference required" }, 400);
      }

      const paymentRequest: any = {
        merchantAccount,
        amount: {
          value: Math.round(amount * 100), // Convert dollars to cents
          currency: currency || "AUD",
        },
        reference,
        returnUrl: return_url || `${supabaseUrl}/payment-complete`,
      };

      // If card details provided (for simple integration)
      if (card) {
        paymentRequest.paymentMethod = {
          type: "scheme",
          number: card.number,
          expiryMonth: card.expiry_month,
          expiryYear: card.expiry_year,
          cvc: card.cvc,
          holderName: card.holder_name || "Customer",
        };
      }

      const resp = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(paymentRequest),
      });

      const result = await resp.json();
      return json(result, resp.ok ? 200 : 400);
    }

    // ── GET PAYMENT METHODS ──
    if (action === "payment_methods") {
      const { amount, currency } = body;

      const resp = await fetch(`${baseUrl}/paymentMethods`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          merchantAccount,
          countryCode: "AU",
          amount: {
            value: Math.round((amount || 0) * 100),
            currency: currency || "AUD",
          },
          channel: "Web",
        }),
      });

      const result = await resp.json();
      return json(result, resp.ok ? 200 : 400);
    }

    // ── PAYMENT DETAILS (3DS) ──
    if (action === "payment_details") {
      const { details } = body;

      const resp = await fetch(`${baseUrl}/payments/details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({ details }),
      });

      const result = await resp.json();
      return json(result, resp.ok ? 200 : 400);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
