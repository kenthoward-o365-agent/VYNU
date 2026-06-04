import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-05-28.basil" });

  const authHeader = req.headers.get("Authorization") || "";
  const isCron = !authHeader;

  if (!isCron) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Not authorised" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const isDryRun = !!body.dry_run;

    const { data: invoices } = await adminClient
      .from("venue_invoices")
      .select("id, venue_id, total, currency, invoice_number")
      .eq("status", "open")
      .lte("due_date", new Date().toISOString().split("T")[0])
      .not("status", "in", "(manual_pending,void,uncollectible)");

    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ charged: 0, results: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const inv of invoices) {
      // Get billing account
      const { data: acct } = await adminClient
        .from("venue_billing_accounts")
        .select("stripe_customer_id, default_payment_method_id, payment_method_type")
        .eq("venue_id", inv.venue_id)
        .maybeSingle();

      if (!acct || !acct.stripe_customer_id || acct.payment_method_type === "manual" || !acct.default_payment_method_id) {
        results.push({ invoice_id: inv.id, skipped: true, reason: "No payment method configured or manual billing" });
        continue;
      }

      if (isDryRun) {
        results.push({
          invoice_id: inv.id,
          dry_run: true,
          amount: inv.total,
          currency: inv.currency,
          customer: acct.stripe_customer_id,
          payment_method: acct.default_payment_method_id,
        });
        continue;
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(inv.total * 100),
          currency: inv.currency.toLowerCase(),
          customer: acct.stripe_customer_id,
          payment_method: acct.default_payment_method_id,
          off_session: true,
          confirm: true,
          idempotency_key: inv.id,
          metadata: {
            venue_id: inv.venue_id,
            invoice_id: inv.id,
            invoice_number: inv.invoice_number,
          },
        });

        // Record payment attempt
        await adminClient.from("venue_invoice_payments").insert({
          invoice_id: inv.id,
          stripe_payment_intent_id: paymentIntent.id,
          amount: inv.total,
          status: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
          method_type: acct.payment_method_type,
          attempted_at: new Date().toISOString(),
        });

        await adminClient
          .from("venue_invoices")
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            attempt_count: 1,
          })
          .eq("id", inv.id);

        results.push({
          invoice_id: inv.id,
          payment_intent_id: paymentIntent.id,
          status: paymentIntent.status,
        });
      } catch (err: any) {
        // Stripe error — record failure
        const declineCode = err.raw?.decline_code || err.code;
        await adminClient.from("venue_invoice_payments").insert({
          invoice_id: inv.id,
          amount: inv.total,
          status: "failed",
          failure_code: err.code,
          failure_message: err.message,
          method_type: acct.payment_method_type,
          attempted_at: new Date().toISOString(),
        });

        await adminClient
          .from("venue_invoices")
          .update({ status: "failed", attempt_count: 1 })
          .eq("id", inv.id);

        await adminClient.from("venue_billing_events").insert({
          venue_id: inv.venue_id,
          invoice_id: inv.id,
          event_type: "charge_failed",
          description: `Immediate charge failed: ${err.message}`,
        });

        results.push({ invoice_id: inv.id, error: err.message, status: "failed" });
      }
    }

    return new Response(JSON.stringify({
      charged: results.filter(r => r.payment_intent_id).length,
      failed: results.filter(r => r.error).length,
      skipped: results.filter(r => r.skipped).length,
      dry_run: isDryRun,
      results,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ar-charge-due-invoices error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
