// Awards loyalty points for a paid order using the venue's resolved Ordrup Rewards program.
// Idempotent: if the order already earned points (diner_visits row with points_awarded > 0), it does nothing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface EarnBody {
  order_id?: string;
  diner_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as EarnBody;
    const { order_id, diner_id } = body;
    if (!order_id || typeof order_id !== "string") {
      return json({ error: "order_id is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull order with venue + spend (excluding tax/gratuity is approximated as total - gratuity).
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, venue_id, total, gratuity_amount, status, customer_id")
      .eq("id", order_id)
      .maybeSingle();
    if (orderErr || !order) return json({ error: "Order not found" }, 404);

    const dinerProfileId = diner_id || null;
    if (!dinerProfileId) {
      return json({ skipped: true, reason: "guest_order" });
    }

    // Idempotency: if a visit row with points_awarded already exists for this order, skip.
    const { data: existingVisit } = await admin
      .from("diner_visits")
      .select("id, points_awarded")
      .eq("order_id", order_id)
      .maybeSingle();
    if (existingVisit && Number(existingVisit.points_awarded || 0) > 0) {
      return json({ skipped: true, reason: "already_awarded" });
    }

    // Resolve active program for this venue (group > venue priority, optouts respected).
    const { data: programRows, error: progErr } = await admin
      .rpc("get_active_loyalty_program", { _venue_id: order.venue_id });
    if (progErr) return json({ error: progErr.message }, 500);
    const program = Array.isArray(programRows) ? programRows[0] : programRows;
    if (!program) return json({ skipped: true, reason: "no_active_program" });

    const rules = (program.rules ?? {}) as Record<string, unknown>;
    const pointsPerDollar = Number(rules.earn_points_per_dollar ?? rules.points_per_dollar ?? 0);
    if (pointsPerDollar <= 0) {
      return json({ skipped: true, reason: "earn_disabled" });
    }

    const grossTotal = Number(order.total || 0);
    const gratuity = Number(order.gratuity_amount || 0);
    // We don't have tax breakdown server-side; use total minus gratuity as the earnable spend.
    // (Inclusive taxes are baked in; this matches what the diner actually paid for goods.)
    const earnableSpend = Math.max(0, grossTotal - gratuity);
    const points = Math.floor(earnableSpend * pointsPerDollar);

    if (points <= 0) return json({ skipped: true, reason: "zero_points" });

    // Upsert balance for (diner, program).
    const { data: existingBal } = await admin
      .from("loyalty_balances")
      .select("id, balance")
      .eq("diner_id", dinerProfileId)
      .eq("program_id", program.id)
      .maybeSingle();

    if (existingBal) {
      await admin
        .from("loyalty_balances")
        .update({ balance: Number(existingBal.balance || 0) + points, updated_at: new Date().toISOString() })
        .eq("id", existingBal.id);
    } else {
      await admin
        .from("loyalty_balances")
        .insert({ diner_id: dinerProfileId, program_id: program.id, balance: points });
    }

    // Update or insert diner_visits with points_awarded + spend.
    if (existingVisit) {
      await admin
        .from("diner_visits")
        .update({ points_awarded: points, spend_excl_tax: earnableSpend })
        .eq("id", existingVisit.id);
    } else {
      await admin
        .from("diner_visits")
        .insert({
          diner_id: dinerProfileId,
          venue_id: order.venue_id,
          order_id: order.id,
          points_awarded: points,
          spend_excl_tax: earnableSpend,
        });
    }

    return json({ ok: true, points_awarded: points, program_id: program.id, program_name: program.name });
  } catch (err) {
    console.error("loyalty-earn error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
