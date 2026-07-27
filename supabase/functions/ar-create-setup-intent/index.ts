import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { safeErrorResponse } from "../_shared/safe-error.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  // Check admin or venue staff
  const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });

  try {
    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      const { data: isStaff } = await adminClient.rpc("is_venue_staff", { _user_id: user.id, _venue_id: venue_id });
      if (!isStaff) {
        return new Response(JSON.stringify({ error: "Not authorised" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-05-28.basil" });

    let customerId = await adminClient.rpc("ensure_stripe_customer_for_venue", { _venue_id: venue_id }).then(r => r.data);

    if (!customerId || (customerId as string).startsWith("pending_")) {
      const { data: venue } = await adminClient.from("venues").select("name, email").eq("id", venue_id).single();
      const c = await stripe.customers.create({
        name: venue?.name,
        email: venue?.email,
        metadata: { venue_id },
      });
      customerId = c.id;
      await adminClient
        .from("venue_billing_accounts")
        .upsert({ venue_id, stripe_customer_id: customerId }, { onConflict: "venue_id" });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId as string,
      payment_method_types: ["card", "au_becs_debit"],
      metadata: { venue_id },
    });

    return new Response(JSON.stringify({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return safeErrorResponse("ar-create-setup-intent", err, corsHeaders);
  }
});
