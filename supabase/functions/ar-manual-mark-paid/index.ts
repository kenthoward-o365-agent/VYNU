import { createClient } from "npm:@supabase/supabase-js@2";
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
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Not authorised" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { invoice_id, amount, notes } = await req.json();
    if (!invoice_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "invoice_id and positive amount required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice } = await adminClient
      .from("venue_invoices")
      .select("id, venue_id, total, status, commission_amount, min_fee_amount, paid_at")
      .eq("id", invoice_id)
      .single();

    if (!invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remaining = parseFloat(invoice.total as any) - parseFloat((invoice.paid_at ? amount : 0) as any);
    const newStatus = amount >= parseFloat(invoice.total as any) ? "paid" : "partially_paid";

    await adminClient.from("venue_invoice_payments").insert({
      invoice_id,
      amount,
      status: "succeeded",
      method_type: "manual",
      settled_at: new Date().toISOString(),
      metadata: { notes, recorded_by: user.id },
    });

    await adminClient
      .from("venue_invoices")
      .update({
        status: newStatus,
        paid_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    await adminClient.from("venue_billing_events").insert({
      venue_id: invoice.venue_id,
      invoice_id,
      event_type: "manual_payment_recorded",
      description: `Manual payment of ${amount} recorded. Status: ${newStatus}.`,
      metadata: { amount, notes, recorded_by: user.id },
      created_by: user.id,
    });

    return new Response(JSON.stringify({ success: true, new_status: newStatus }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ar-manual-mark-paid error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
