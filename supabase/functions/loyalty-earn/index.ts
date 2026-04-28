// Awards loyalty rewards for a paid order using the venue's resolved Shyndig Loyalty program.
// Supports: points-per-dollar OR visit/item stamps, status tiers (rolling 12mo spend) with earn multipliers,
// signup bonus, milestone rewards, and birthday rewards. Idempotent via diner_visits + loyalty_rewards_issued.idempotency_key.
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

type Rules = Record<string, any>;

function pickEarnMode(rules: Rules): "points" | "stamps" {
  return rules?.earn?.mode === "stamps" ? "stamps" : "points";
}

function pointsPerDollar(rules: Rules): number {
  return Number(rules?.earn?.points_per_dollar ?? rules?.points_per_dollar ?? 0);
}

function tierForSpend(rules: Rules, lifetimeSpend: number): { name: string | null; multiplier: number } {
  const t = rules?.tiers;
  if (!t?.enabled || !Array.isArray(t.levels) || t.levels.length === 0) return { name: null, multiplier: 1 };
  // Sort ascending by threshold; pick highest level whose threshold ≤ spend
  const sorted = [...t.levels].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
  let chosen = sorted[0];
  for (const l of sorted) {
    if (Number(l.threshold || 0) <= lifetimeSpend) chosen = l;
  }
  return { name: chosen?.name ?? null, multiplier: Number(chosen?.earn_multiplier ?? 1) || 1 };
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
      .rpc("get_active_loyalty_program", { p_venue_id: order.venue_id });
    if (progErr) return json({ error: progErr.message }, 500);
    const program = Array.isArray(programRows) ? programRows[0] : programRows;
    if (!program) return json({ skipped: true, reason: "no_active_program" });

    const rules = (program.rules ?? {}) as Rules;
    const mode = pickEarnMode(rules);

    const grossTotal = Number(order.total || 0);
    const gratuity = Number(order.gratuity_amount || 0);
    const earnableSpend = Math.max(0, grossTotal - gratuity);

    // Compute rolling 12mo spend BEFORE this order (then add this order's earnable spend).
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data: prevVisits } = await admin
      .from("diner_visits")
      .select("spend_excl_tax")
      .eq("diner_id", dinerProfileId)
      .gte("visited_at", since);
    const priorSpend = (prevVisits || []).reduce((s, v) => s + Number(v.spend_excl_tax || 0), 0);
    const lifetimeSpendForTier = priorSpend + earnableSpend;
    const tier = tierForSpend(rules, lifetimeSpendForTier);

    // Compute reward amount for this order (points or 1 stamp).
    let amountAwarded = 0;
    if (mode === "stamps") {
      // 1 stamp per visit (item-trigger needs order_items aggregation; default to per-visit).
      amountAwarded = 1;
    } else {
      const ppd = pointsPerDollar(rules);
      if (ppd > 0) amountAwarded = Math.floor(earnableSpend * ppd * tier.multiplier);
    }

    // Get current balance
    const { data: existingBal } = await admin
      .from("loyalty_balances")
      .select("id, balance")
      .eq("diner_id", dinerProfileId)
      .eq("program_id", program.id)
      .maybeSingle();

    const priorBalance = Number(existingBal?.balance ?? 0);
    let newBalance = priorBalance + amountAwarded;

    // Signup bonus — if no existing balance row, this is their first qualifying activity.
    let signupBonusAwarded = 0;
    if (!existingBal && rules?.signup_bonus?.enabled && Number(rules.signup_bonus?.points || 0) > 0) {
      // Idempotency: only one signup bonus per (diner, program) ever.
      const sigKey = `signup-${dinerProfileId}-${program.id}`;
      const { data: existingSignup } = await admin
        .from("loyalty_rewards_issued")
        .select("id")
        .eq("idempotency_key", sigKey)
        .maybeSingle();
      if (!existingSignup) {
        signupBonusAwarded = Number(rules.signup_bonus.points || 0);
        newBalance += signupBonusAwarded;
        await admin.from("loyalty_rewards_issued").insert({
          diner_id: dinerProfileId,
          program_id: program.id,
          reward_kind: "signup",
          reward_payload: { type: "points", points: signupBonusAwarded },
          idempotency_key: sigKey,
        });
      }
    }

    // Upsert balance with new total + tier.
    if (existingBal) {
      await admin
        .from("loyalty_balances")
        .update({ balance: newBalance, tier: tier.name, updated_at: new Date().toISOString() })
        .eq("id", existingBal.id);
    } else {
      await admin
        .from("loyalty_balances")
        .insert({ diner_id: dinerProfileId, program_id: program.id, balance: newBalance, tier: tier.name });
    }

    // Update or insert diner_visits with points_awarded + spend.
    if (existingVisit) {
      await admin
        .from("diner_visits")
        .update({ points_awarded: amountAwarded, spend_excl_tax: earnableSpend })
        .eq("id", existingVisit.id);
    } else {
      await admin
        .from("diner_visits")
        .insert({
          diner_id: dinerProfileId,
          venue_id: order.venue_id,
          order_id: order.id,
          points_awarded: amountAwarded,
          spend_excl_tax: earnableSpend,
        });
    }

    // Milestone rewards — only for points mode; fire if newBalance crossed any threshold not previously crossed.
    const milestonesIssued: any[] = [];
    if (mode === "points" && Array.isArray(rules.milestones)) {
      for (const m of rules.milestones as any[]) {
        const at = Number(m.at_points || 0);
        if (!(at > 0)) continue;
        if (priorBalance >= at) continue; // already past
        if (newBalance < at) continue; // not crossed yet
        const key = `milestone-${dinerProfileId}-${program.id}-${at}`;
        const { data: dupe } = await admin
          .from("loyalty_rewards_issued")
          .select("id")
          .eq("idempotency_key", key)
          .maybeSingle();
        if (dupe) continue;
        const payload: any = { label: m.label, type: m.reward_type };
        if (m.reward_type === "discount_dollars") payload.discount_dollars = Number(m.value || 0);
        else if (m.reward_type === "free_item") payload.free_item_id = m.free_item_id || null;
        else if (m.reward_type === "points") {
          payload.points = Number(m.value || 0);
          // Points-type milestones immediately add to balance.
          newBalance += payload.points;
        }
        const { data: inserted } = await admin
          .from("loyalty_rewards_issued")
          .insert({
            diner_id: dinerProfileId,
            program_id: program.id,
            reward_kind: "milestone",
            reward_payload: payload,
            idempotency_key: key,
          })
          .select("id")
          .maybeSingle();
        if (inserted) milestonesIssued.push({ at, ...payload });
      }
      // If milestones added points, persist updated balance.
      if (milestonesIssued.some((m) => m.type === "points")) {
        await admin.from("loyalty_balances").update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("diner_id", dinerProfileId).eq("program_id", program.id);
      }
    }

    // Birthday reward — fire once per calendar year if birthday is within ±valid_days window.
    let birthdayIssued: any = null;
    if (rules?.birthday_reward?.enabled) {
      const { data: prof } = await admin
        .from("diner_profiles")
        .select("birthday")
        .eq("id", dinerProfileId)
        .maybeSingle();
      const bday = prof?.birthday as string | null | undefined;
      if (bday) {
        // Build this year's birthday date and check window.
        const today = new Date();
        const [, mm, dd] = bday.split("-"); // ISO YYYY-MM-DD
        const yr = today.getUTCFullYear();
        const thisYear = new Date(Date.UTC(yr, Number(mm) - 1, Number(dd)));
        const validDays = Number(rules.birthday_reward.valid_days ?? 14);
        const diffDays = Math.floor((today.getTime() - thisYear.getTime()) / (1000 * 60 * 60 * 24));
        // Award if within [−validDays, +validDays]
        if (Math.abs(diffDays) <= validDays) {
          const key = `birthday-${yr}-${dinerProfileId}-${program.id}`;
          const { data: dupe } = await admin
            .from("loyalty_rewards_issued")
            .select("id")
            .eq("idempotency_key", key)
            .maybeSingle();
          if (!dupe) {
            const expires = new Date(thisYear.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString();
            const payload: any = { type: rules.birthday_reward.type ?? "points", expires_at: expires };
            if (payload.type === "points") payload.points = Number(rules.birthday_reward.points || 0);
            else if (payload.type === "free_item") payload.free_item_id = rules.birthday_reward.free_item_id || null;
            else if (payload.type === "percent_discount") payload.discount_percent = Number(rules.birthday_reward.discount_percent || 0);
            const { data: inserted } = await admin
              .from("loyalty_rewards_issued")
              .insert({
                diner_id: dinerProfileId,
                program_id: program.id,
                reward_kind: "birthday",
                reward_payload: payload,
                idempotency_key: key,
              })
              .select("id, reward_payload")
              .maybeSingle();
            if (inserted) {
              birthdayIssued = inserted.reward_payload;
              // If birthday is bonus points, add to balance immediately.
              if (payload.type === "points" && payload.points > 0) {
                newBalance += payload.points;
                await admin.from("loyalty_balances").update({ balance: newBalance, updated_at: new Date().toISOString() })
                  .eq("diner_id", dinerProfileId).eq("program_id", program.id);
              }
            }
          }
        }
      }
    }

    return json({
      ok: true,
      mode,
      amount_awarded: amountAwarded,
      tier: tier.name,
      tier_multiplier: tier.multiplier,
      new_balance: newBalance,
      signup_bonus_awarded: signupBonusAwarded,
      milestones_issued: milestonesIssued,
      birthday_issued: birthdayIssued,
      program_id: program.id,
      program_name: program.name,
    });
  } catch (err) {
    console.error("loyalty-earn error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
