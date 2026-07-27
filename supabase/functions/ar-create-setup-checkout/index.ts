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
  const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Not authorised" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { venue_id, method_types = ["card", "au_becs_debit"], return_url } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-05-28.basil" });

    // Ensure customer exists
    let customerId = await adminClient.rpc("ensure_stripe_customer_for_venue", { _venue_id: venue_id }).then(r => r.data);

    // If still pending, create real Stripe customer
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

    const appUrl = return_url || (Deno.env.get("APP_URL") || "https://hlordernow.lovable.app");
    const successUrl = `${appUrl}/admin/venues/${venue_id}?tab=commercials&setup=success`;
    const cancelUrl = `${appUrl}/admin/venues/${venue_id}?tab=commercials&setup=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId as string,
      payment_method_types: method_types.filter((t: string) => ["card", "au_becs_debit", "us_bank_account"].includes(t)),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { venue_id, initiated_by: user.id },
    });

    await adminClient.from("venue_billing_events").insert({
      venue_id,
      event_type: "onboarding_link_sent",
      description: "Setup Checkout session created",
      metadata: { checkout_session_id: session.id },
      created_by: user.id,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return safeErrorResponse("ar-create-setup-checkout", err, corsHeaders);
  }
});
