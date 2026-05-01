// Shared loyalty-award business logic.
// Used by:
//   - process-job-queue worker (async path, post-Phase 4)
//   - loyalty-earn legacy path (still callable for tests / sync re-trigger)
//
// Pure-ish: takes a Supabase admin client + payload, returns a result object.
// All side-effects go through the supplied client so callers can swap it.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface LoyaltyEarnPayload {
  order_id: string;
  diner_id?: string | null;
}

export interface LoyaltyEarnResult {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  mode?: "points" | "stamps";
  amount_awarded?: number;
  tier?: string | null;
  tier_multiplier?: number;
  new_balance?: number;
  signup_bonus_awarded?: number;
  milestones_issued?: any[];
  birthday_issued?: any;
  program_id?: string;
  program_name?: string;
  error?: string;
}

type Rules = Record<string, any>;

function pickEarnMode(rules: Rules): "points" | "stamps" {
  return rules?.earn?.mode === "stamps" ? "stamps" : "points";
}

function pointsPerDollar(rules: Rules): number {
  return Number(rules?.earn?.points_per_dollar ?? rules?.points_per_dollar ?? 0);
}

function tierForSpend(
  rules: Rules,
  lifetimeSpend: number,
): { name: string | null; multiplier: number } {
  const t = rules?.tiers;
  if (!t?.enabled || !Array.isArray(t.levels) || t.levels.length === 0) {
    return { name: null, multiplier: 1 };
  }
  const sorted = [...t.levels].sort(
    (a, b) => Number(a.threshold || 0) - Number(b.threshold || 0),
  );
  let chosen = sorted[0];
  for (const l of sorted) {
    if (Number(l.threshold || 0) <= lifetimeSpend) chosen = l;
  }
  return {
    name: chosen?.name ?? null,
    multiplier: Number(chosen?.earn_multiplier ?? 1) || 1,
  };
}

export async function awardLoyalty(
  admin: SupabaseClient,
  payload: LoyaltyEarnPayload,
): Promise<LoyaltyEarnResult> {
  const { order_id, diner_id } = payload;
  if (!order_id) return { error: "order_id required" };

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, venue_id, total, gratuity_amount, status, customer_id")
    .eq("id", order_id)
    .maybeSingle();
  if (orderErr || !order) return { error: "Order not found" };

  const dinerProfileId = diner_id || null;
  if (!dinerProfileId) return { skipped: true, reason: "guest_order" };

  const { data: existingVisit } = await admin
    .from("diner_visits")
    .select("id, points_awarded")
    .eq("order_id", order_id)
    .maybeSingle();
  if (existingVisit && Number(existingVisit.points_awarded || 0) > 0) {
    return { skipped: true, reason: "already_awarded" };
  }

  const { data: programRows, error: progErr } = await admin
    .rpc("get_active_loyalty_program", { p_venue_id: order.venue_id });
  if (progErr) return { error: progErr.message };
  const program = Array.isArray(programRows) ? programRows[0] : programRows;
  if (!program) return { skipped: true, reason: "no_active_program" };

  const rules = (program.rules ?? {}) as Rules;
  const mode = pickEarnMode(rules);

  const grossTotal = Number(order.total || 0);
  const gratuity = Number(order.gratuity_amount || 0);
  const earnableSpend = Math.max(0, grossTotal - gratuity);

  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: prevVisits } = await admin
    .from("diner_visits")
    .select("spend_excl_tax")
    .eq("diner_id", dinerProfileId)
    .gte("visited_at", since);
  const priorSpend = (prevVisits || []).reduce(
    (s, v: any) => s + Number(v.spend_excl_tax || 0),
    0,
  );
  const lifetimeSpendForTier = priorSpend + earnableSpend;
  const tier = tierForSpend(rules, lifetimeSpendForTier);

  let amountAwarded = 0;
  if (mode === "stamps") {
    amountAwarded = 1;
  } else {
    const ppd = pointsPerDollar(rules);
    if (ppd > 0) amountAwarded = Math.floor(earnableSpend * ppd * tier.multiplier);
  }

  const { data: existingBal } = await admin
    .from("loyalty_balances")
    .select("id, balance")
    .eq("diner_id", dinerProfileId)
    .eq("program_id", program.id)
    .maybeSingle();

  const priorBalance = Number(existingBal?.balance ?? 0);
  let newBalance = priorBalance + amountAwarded;

  let signupBonusAwarded = 0;
  if (
    !existingBal && rules?.signup_bonus?.enabled &&
    Number(rules.signup_bonus?.points || 0) > 0
  ) {
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

  if (existingBal) {
    await admin
      .from("loyalty_balances")
      .update({
        balance: newBalance,
        tier: tier.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingBal.id);
  } else {
    await admin
      .from("loyalty_balances")
      .insert({
        diner_id: dinerProfileId,
        program_id: program.id,
        balance: newBalance,
        tier: tier.name,
      });
  }

  if (existingVisit) {
    await admin
      .from("diner_visits")
      .update({ points_awarded: amountAwarded, spend_excl_tax: earnableSpend })
      .eq("id", existingVisit.id);
  } else {
    await admin.from("diner_visits").insert({
      diner_id: dinerProfileId,
      venue_id: order.venue_id,
      order_id: order.id,
      points_awarded: amountAwarded,
      spend_excl_tax: earnableSpend,
    });
  }

  const milestonesIssued: any[] = [];
  if (mode === "points" && Array.isArray(rules.milestones)) {
    for (const m of rules.milestones as any[]) {
      const at = Number(m.at_points || 0);
      if (!(at > 0)) continue;
      if (priorBalance >= at) continue;
      if (newBalance < at) continue;
      const key = `milestone-${dinerProfileId}-${program.id}-${at}`;
      const { data: dupe } = await admin
        .from("loyalty_rewards_issued")
        .select("id")
        .eq("idempotency_key", key)
        .maybeSingle();
      if (dupe) continue;
      const rewardPayload: any = { label: m.label, type: m.reward_type };
      if (m.reward_type === "discount_dollars") {
        rewardPayload.discount_dollars = Number(m.value || 0);
      } else if (m.reward_type === "free_item") {
        rewardPayload.free_item_id = m.free_item_id || null;
      } else if (m.reward_type === "points") {
        rewardPayload.points = Number(m.value || 0);
        newBalance += rewardPayload.points;
      }
      const { data: inserted } = await admin
        .from("loyalty_rewards_issued")
        .insert({
          diner_id: dinerProfileId,
          program_id: program.id,
          reward_kind: "milestone",
          reward_payload: rewardPayload,
          idempotency_key: key,
        })
        .select("id")
        .maybeSingle();
      if (inserted) milestonesIssued.push({ at, ...rewardPayload });
    }
    if (milestonesIssued.some((m) => m.type === "points")) {
      await admin
        .from("loyalty_balances")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("diner_id", dinerProfileId)
        .eq("program_id", program.id);
    }
  }

  let birthdayIssued: any = null;
  if (rules?.birthday_reward?.enabled) {
    const { data: prof } = await admin
      .from("diner_profiles")
      .select("birthday")
      .eq("id", dinerProfileId)
      .maybeSingle();
    const bday = (prof as any)?.birthday as string | null | undefined;
    if (bday) {
      const today = new Date();
      const [, mm, dd] = bday.split("-");
      const yr = today.getUTCFullYear();
      const thisYear = new Date(Date.UTC(yr, Number(mm) - 1, Number(dd)));
      const validDays = Number(rules.birthday_reward.valid_days ?? 14);
      const diffDays = Math.floor(
        (today.getTime() - thisYear.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (Math.abs(diffDays) <= validDays) {
        const key = `birthday-${yr}-${dinerProfileId}-${program.id}`;
        const { data: dupe } = await admin
          .from("loyalty_rewards_issued")
          .select("id")
          .eq("idempotency_key", key)
          .maybeSingle();
        if (!dupe) {
          const expires = new Date(
            thisYear.getTime() + validDays * 24 * 60 * 60 * 1000,
          ).toISOString();
          const rewardPayload: any = {
            type: rules.birthday_reward.type ?? "points",
            expires_at: expires,
          };
          if (rewardPayload.type === "points") {
            rewardPayload.points = Number(rules.birthday_reward.points || 0);
          } else if (rewardPayload.type === "free_item") {
            rewardPayload.free_item_id = rules.birthday_reward.free_item_id || null;
          } else if (rewardPayload.type === "percent_discount") {
            rewardPayload.discount_percent = Number(
              rules.birthday_reward.discount_percent || 0,
            );
          }
          const { data: inserted } = await admin
            .from("loyalty_rewards_issued")
            .insert({
              diner_id: dinerProfileId,
              program_id: program.id,
              reward_kind: "birthday",
              reward_payload: rewardPayload,
              idempotency_key: key,
            })
            .select("id, reward_payload")
            .maybeSingle();
          if (inserted) {
            birthdayIssued = (inserted as any).reward_payload;
            if (rewardPayload.type === "points" && rewardPayload.points > 0) {
              newBalance += rewardPayload.points;
              await admin
                .from("loyalty_balances")
                .update({
                  balance: newBalance,
                  updated_at: new Date().toISOString(),
                })
                .eq("diner_id", dinerProfileId)
                .eq("program_id", program.id);
            }
          }
        }
      }
    }
  }

  // Fan-out a diner notification for any meaningful award.
  if (
    amountAwarded > 0 ||
    signupBonusAwarded > 0 ||
    milestonesIssued.length > 0 ||
    birthdayIssued
  ) {
    await admin.from("notifications").insert({
      diner_id: dinerProfileId,
      venue_id: order.venue_id,
      kind: "loyalty_awarded",
      title: mode === "stamps" ? "Stamp earned!" : `+${amountAwarded} points`,
      body: program.name,
      payload: {
        program_id: program.id,
        amount_awarded: amountAwarded,
        new_balance: newBalance,
        tier: tier.name,
        signup_bonus_awarded: signupBonusAwarded,
        milestones_issued: milestonesIssued,
        birthday_issued: birthdayIssued,
      },
    });
  }

  return {
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
  };
}
