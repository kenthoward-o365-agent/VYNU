import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-05-28.basil" });

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig || "", secret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency check
  const { data: existing } = await adminClient
    .from("processed_stripe_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ processed: false, reason: "already seen" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Helper to log events
  const logEvent = async (venueId: string | null, invoiceId: string | null, type: string, desc: string) => {
    await adminClient.from("venue_billing_events").insert({
      venue_id: venueId,
      invoice_id: invoiceId,
      event_type: type,
      description: desc,
    });
  };

  try {
    switch (event.type) {
      case "setup_intent.succeeded": {
        const si = event.data.object as Stripe.SetupIntent;
        const pmId = si.payment_method as string;
        const customerId = si.customer as string;

        const { data: acct } = await adminClient
          .from("venue_billing_accounts")
          .select("venue_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!acct) break;

        const pm = await stripe.paymentMethods.retrieve(pmId);
        await adminClient.from("venue_payment_methods").insert({
          venue_id: acct.venue_id,
          stripe_payment_method_id: pmId,
          type: pm.type === "au_becs_debit" ? "becs" : pm.type === "us_bank_account" ? "ach" : "card",
          brand: pm.card?.brand,
          last4: pm.card?.last4 ?? pm.au_becs_debit?.last4 ?? pm.us_bank_account?.last4,
          exp_month: pm.card?.exp_month,
          exp_year: pm.card?.exp_year,
          bank_name: pm.au_becs_debit?.bank_name ?? pm.us_bank_account?.bank_name,
          bsb_last4: pm.au_becs_debit?.bsb_number ? pm.au_becs_debit.bsb_number.slice(-4) : undefined,
          routing_last4: pm.us_bank_account?.routing_number ? pm.us_bank_account.routing_number.slice(-4) : undefined,
          mandate_id: pm.au_becs_debit?.fingerprint,
          fingerprint: pm.card?.fingerprint ?? pm.au_becs_debit?.fingerprint ?? pm.us_bank_account?.fingerprint,
          is_default: true,
          billing_details: pm.billing_details,
        });

        await adminClient
          .from("venue_billing_accounts")
          .update({
            default_payment_method_id: pmId,
            payment_method_type: pm.type === "au_becs_debit" ? "becs" : pm.type === "us_bank_account" ? "ach" : "card",
          })
          .eq("venue_id", acct.venue_id);

        await logEvent(acct.venue_id, null, "payment_method_added", `Payment method ${pm.type} added via Stripe`);
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { data: inv } = await adminClient
          .from("venue_invoices")
          .select("id, venue_id, total")
          .eq("stripe_payment_intent_id", pi.id)
          .maybeSingle();
        if (!inv) break;

        await adminClient
          .from("venue_invoices")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", inv.id);

        await adminClient
          .from("venue_invoice_payments")
          .update({ status: "succeeded", settled_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi.id);

        await logEvent(inv.venue_id, inv.id, "charge_succeeded", `Payment succeeded: ${inv.total} ${pi.currency}`);
        break;
      }

      case "payment_intent.payment_failed": {
        const pif = event.data.object as Stripe.PaymentIntent;
        const { data: inv } = await adminClient
          .from("venue_invoices")
          .select("id, venue_id, attempt_count")
          .eq("stripe_payment_intent_id", pif.id)
          .maybeSingle();
        if (!inv) break;

        const failureMsg = pif.last_payment_error?.message || "Unknown failure";
        const failureCode = pif.last_payment_error?.code || "unknown";

        await adminClient
          .from("venue_invoice_payments")
          .update({ status: "failed", failure_code: failureCode, failure_message: failureMsg })
          .eq("stripe_payment_intent_id", pif.id);

        const { data: dunning } = await adminClient
          .from("ar_dunning_schedules")
          .select("retry_days, max_attempts, uncollectible_after_attempts")
          .eq("is_default", true)
          .single();

        const attempts = (inv.attempt_count || 0) + 1;
        let nextRetry: string | null = null;
        let newStatus = "failed";

        if (dunning && attempts < dunning.max_attempts && attempts <= dunning.retry_days.length) {
          const days = dunning.retry_days[attempts - 1];
          const d = new Date();
          d.setDate(d.getDate() + days);
          nextRetry = d.toISOString();
        } else if (dunning && attempts >= dunning.uncollectible_after_attempts) {
          newStatus = "uncollectible";
        }

        await adminClient
          .from("venue_invoices")
          .update({ status: newStatus, attempt_count: attempts, next_retry_at: nextRetry })
          .eq("id", inv.id);

        await logEvent(inv.venue_id, inv.id, "charge_failed", `Attempt ${attempts} failed: ${failureMsg}`);

        // Create staff alert
        await adminClient.from("staff_alerts").insert({
          venue_id: inv.venue_id,
          severity: attempts >= 3 ? "high" : "medium",
          message: `Payment failed for invoice (${attempts} attempts): ${failureMsg}`,
          source: "ar_dunning",
        });
        break;
      }

      case "payment_method.detached": {
        const pmd = event.data.object as Stripe.PaymentMethod;
        await adminClient
          .from("venue_payment_methods")
          .update({ is_active: false })
          .eq("stripe_payment_method_id", pmd.id);
        break;
      }

      case "charge.refunded": {
        const cr = event.data.object as Stripe.Charge;
        if (!cr.payment_intent) break;
        const { data: payment } = await adminClient
          .from("venue_invoice_payments")
          .select("id, invoice_id")
          .eq("stripe_payment_intent_id", cr.payment_intent as string)
          .maybeSingle();
        if (!payment) break;
        await adminClient
          .from("venue_invoice_payments")
          .update({ status: "refunded" })
          .eq("id", payment.id);
        await logEvent(null, payment.invoice_id, "charge_failed", `Charge refunded: ${cr.amount_refunded} cents`);
        break;
      }
    }

    // Mark event processed
    await adminClient.from("processed_stripe_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
