import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

  try {
    const { venue_id, payment_method_id } = await req.json();
    if (!venue_id || !payment_method_id) {
      return new Response(JSON.stringify({ error: "venue_id and payment_method_id required" }), {
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

    // Verify the PM belongs to this venue
    const { data: methodRow } = await adminClient
      .from("venue_payment_methods")
      .select("stripe_payment_method_id, type")
      .eq("venue_id", venue_id)
      .eq("id", payment_method_id)
      .single();

    if (!methodRow) {
      return new Response(JSON.stringify({ error: "Payment method not found for this venue" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update Stripe customer default
    const { data: acct } = await adminClient
      .from("venue_billing_accounts")
      .select("stripe_customer_id")
      .eq("venue_id", venue_id)
      .single();

    if (acct?.stripe_customer_id) {
      await stripe.customers.update(acct.stripe_customer_id, {
        invoice_settings: { default_payment_method: methodRow.stripe_payment_method_id },
      });
    }

    // Update DB: clear all defaults for this venue, set new default
    await adminClient
      .from("venue_payment_methods")
      .update({ is_default: false })
      .eq("venue_id", venue_id);

    await adminClient
      .from("venue_payment_methods")
      .update({ is_default: true })
      .eq("id", payment_method_id);

    await adminClient
      .from("venue_billing_accounts")
      .update({ default_payment_method_id: methodRow.stripe_payment_method_id })
      .eq("venue_id", venue_id);

    await adminClient.from("venue_billing_events").insert({
      venue_id,
      event_type: "payment_method_default_changed",
      description: `Default payment method changed to ${methodRow.type}`,
      created_by: user.id,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ar-set-default-method error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
