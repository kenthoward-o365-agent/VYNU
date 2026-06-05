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
      const { data: isMgr } = await adminClient.rpc("is_venue_manager", { _user_id: user.id, _venue_id: venue_id });
      if (!isMgr) {
        return new Response(JSON.stringify({ error: "Not authorised" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-05-28.basil" });

    const { data: methodRow } = await adminClient
      .from("venue_payment_methods")
      .select("stripe_payment_method_id, is_default")
      .eq("venue_id", venue_id)
      .eq("id", payment_method_id)
      .single();

    if (!methodRow) {
      return new Response(JSON.stringify({ error: "Payment method not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce: at least one active payment method must remain on file.
    const { count: remainingActive } = await adminClient
      .from("venue_payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venue_id)
      .eq("is_active", true)
      .neq("id", payment_method_id);

    if (!remainingActive || remainingActive < 1) {
      return new Response(
        JSON.stringify({
          error: "Add a replacement payment method before removing this one. At least one active method must remain on file.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await stripe.paymentMethods.detach(methodRow.stripe_payment_method_id);

    await adminClient
      .from("venue_payment_methods")
      .update({ is_active: false, is_default: false })
      .eq("id", payment_method_id);

    // If this was the default, clear it from billing account
    if (methodRow.is_default) {
      await adminClient
        .from("venue_billing_accounts")
        .update({ default_payment_method_id: null, payment_method_type: "manual" })
        .eq("venue_id", venue_id);
    }

    await adminClient.from("venue_billing_events").insert({
      venue_id,
      event_type: "payment_method_removed",
      description: `Payment method detached`,
      created_by: user.id,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ar-detach-method error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
