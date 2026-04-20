/**
 * Pricing rule evaluation — applies any active venue pricing rules to a base
 * menu-item price and returns both the adjusted price and the name of the
 * rule that applied (so the diner UI can show the rule label next to the
 * struck-through original price).
 *
 * Currently supports time-of-day + day-of-week scheduling and either
 * percent or flat-amount modifiers (negative = discount, positive = surcharge).
 * If multiple rules match the same item, the one producing the lowest
 * effective price wins (best deal for the diner).
 */

export interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  modifier_type: string;       // "percent" | "amount"
  modifier_value: number;      // signed (-10 = 10% off / -2.50 = $2.50 off)
  modifier_percent?: number;   // legacy
  start_time: string | null;   // "HH:MM" or "HH:MM:SS"
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[] | null; // 0=Sun .. 6=Sat
  is_active: boolean | null;
}

export interface PricingRuleItemLink {
  pricing_rule_id: string;
  menu_item_id: string;
}

export interface PriceResolution {
  /** Final price the diner pays per unit (after rules). */
  price: number;
  /** Original menu price (before any rule). */
  originalPrice: number;
  /** True when a rule modified the price. */
  hasOverride: boolean;
  /** Name of the winning rule (only set when hasOverride). */
  ruleName: string | null;
  /** Signed delta (price - originalPrice) for badge display. */
  delta: number;
}

const toMinutes = (hhmm: string | null): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

const isRuleActiveNow = (rule: PricingRule, now: Date): boolean => {
  if (rule.is_active === false) return false;

  // Date window
  if (rule.start_date) {
    const sd = new Date(rule.start_date + "T00:00:00");
    if (now < sd) return false;
  }
  if (rule.end_date) {
    const ed = new Date(rule.end_date + "T23:59:59");
    if (now > ed) return false;
  }

  // Day of week
  if (rule.days_of_week && rule.days_of_week.length > 0) {
    if (!rule.days_of_week.includes(now.getDay())) return false;
  }

  // Time of day window
  const startMin = toMinutes(rule.start_time);
  const endMin = toMinutes(rule.end_time);
  if (startMin !== null || endMin !== null) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (startMin !== null && endMin !== null) {
      if (startMin <= endMin) {
        if (nowMin < startMin || nowMin > endMin) return false;
      } else {
        // Overnight window (e.g. 22:00 → 02:00)
        if (nowMin < startMin && nowMin > endMin) return false;
      }
    } else if (startMin !== null && nowMin < startMin) {
      return false;
    } else if (endMin !== null && nowMin > endMin) {
      return false;
    }
  }

  return true;
};

const applyRule = (basePrice: number, rule: PricingRule): number => {
  const value = Number(rule.modifier_value) || 0;
  if (rule.modifier_type === "percent") {
    return Math.max(0, basePrice * (1 + value / 100));
  }
  // Flat amount (already signed)
  return Math.max(0, basePrice + value);
};

/**
 * Build a fast lookup index from rules + their item assignments.
 * Rules with no entries in `links` apply to all items in the venue.
 */
export const buildRuleIndex = (
  rules: PricingRule[],
  links: PricingRuleItemLink[],
) => {
  const byRule = new Map<string, Set<string>>();
  for (const link of links) {
    let s = byRule.get(link.pricing_rule_id);
    if (!s) {
      s = new Set();
      byRule.set(link.pricing_rule_id, s);
    }
    s.add(link.menu_item_id);
  }
  return { rules, byRule };
};

export type RuleIndex = ReturnType<typeof buildRuleIndex>;

export const resolvePrice = (
  itemId: string,
  basePrice: number,
  index: RuleIndex | null,
  now: Date = new Date(),
): PriceResolution => {
  const original = Number(basePrice) || 0;
  if (!index || index.rules.length === 0) {
    return { price: original, originalPrice: original, hasOverride: false, ruleName: null, delta: 0 };
  }

  let bestPrice = original;
  let bestRuleName: string | null = null;

  for (const rule of index.rules) {
    if (!isRuleActiveNow(rule, now)) continue;
    const scope = index.byRule.get(rule.id);
    // No scope rows = applies to all items
    if (scope && scope.size > 0 && !scope.has(itemId)) continue;
    const candidate = applyRule(original, rule);
    if (candidate < bestPrice - 0.0001) {
      bestPrice = candidate;
      bestRuleName = rule.name;
    }
  }

  const rounded = Math.round(bestPrice * 100) / 100;
  const delta = Math.round((rounded - original) * 100) / 100;
  return {
    price: rounded,
    originalPrice: original,
    hasOverride: bestRuleName !== null,
    ruleName: bestRuleName,
    delta,
  };
};
