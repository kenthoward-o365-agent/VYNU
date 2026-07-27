import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { safeErrorResponse } from "../_shared/safe-error.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-05-28.basil" });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenHash = await sha256(token);
    const { data: record } = await adminClient
      .from("ar_onboarding_tokens")
      .select("id, venue_id, methods_allowed, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!record) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (record.used_at) {
      return new Response(JSON.stringify({ error: "Token already used" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(record.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure Stripe customer
    let customerId = await adminClient.rpc("ensure_stripe_customer_for_venue", { _venue_id: record.venue_id }).then(r => r.data);
    if (!customerId || (customerId as string).startsWith("pending_")) {
      const { data: venue } = await adminClient.from("venues").select("name, email").eq("id", record.venue_id).single();
      const c = await stripe.customers.create({
        name: venue?.name,
        email: venue?.email,
        metadata: { venue_id: record.venue_id },
      });
      customerId = c.id;
      await adminClient
        .from("venue_billing_accounts")
        .upsert({ venue_id: record.venue_id, stripe_customer_id: customerId }, { onConflict: "venue_id" });
    }

    const appUrl = Deno.env.get("APP_URL") || "https://hlordernow.lovable.app";
    const methodTypes = record.methods_allowed
      .filter((m: string) => ["card", "au_becs_debit", "us_bank_account"].includes(m))
      .map((m: string) => m === "becs" ? "au_becs_debit" : m === "ach" ? "us_bank_account" : m);

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId as string,
      payment_method_types: methodTypes,
      success_url: `${appUrl}/billing/setup/success?token=${encodeURIComponent(token)}`,
      cancel_url: `${appUrl}/billing/setup/cancelled?token=${encodeURIComponent(token)}`,
      metadata: { venue_id: record.venue_id, token_id: record.id },
    });

    // Mark the token used so the link is single-use (it was previously
    // reusable until expiry). Set only after the checkout session is
    // created successfully.
    const { error: markUsedErr } = await adminClient
      .from("ar_onboarding_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", record.id)
      .is("used_at", null);
    if (markUsedErr) throw markUsedErr;

    return new Response(JSON.stringify({
      valid: true,
      checkout_url: session.url,
      venue_id: record.venue_id,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return safeErrorResponse("ar-verify-onboarding-token", err, corsHeaders);
  }
});
