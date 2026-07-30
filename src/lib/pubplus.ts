/**
 * Shared Pub+ helpers for the consumer (QR ordering) surfaces.
 *
 * Pub+ is a parent/group-owned loyalty program: when the parent turns it on,
 * every child venue inherits it and members earn/redeem at any venue in the
 * group. There is deliberately no venue-level opt-out.
 */

export interface PubPlusDealLike {
  title?: string;
  description?: string;
}

export interface PubPlusProgramLike {
  id?: string;
  name?: string;
  is_pubplus?: boolean | null;
  group_id?: string | null;
  rules?: unknown;
}

function rulesObject(rules: unknown): Record<string, any> {
  return rules && typeof rules === "object" ? (rules as Record<string, any>) : {};
}

/** True when the resolved loyalty program is the group-wide Pub+ program. */
export function isPubPlusProgram(program: PubPlusProgramLike | null | undefined): boolean {
  if (!program) return false;
  if (program.is_pubplus === true) return true;
  return rulesObject(program.rules).program === "pubplus";
}

export interface PubPlusCopy {
  pointsPerDollar: number;
  coinThreshold: number;
  coinValue: number;
  signupBonus: number;
  deals: { title: string; description: string }[];
  /** One-line summary of how earning works. */
  earnLine: string;
  /** One-line summary of the reward. */
  coinLine: string;
  /** Emphasises that points work across every venue in the group. */
  sharedLine: string;
}

export function pubPlusCopy(rules: unknown): PubPlusCopy {
  const r = rulesObject(rules);
  const pointsPerDollar = Number(r.points_per_dollar ?? r.earn?.points_per_dollar ?? 1) || 1;
  const coinThreshold = Number(r.coin?.threshold_points ?? 200) || 200;
  const coinValue = Number(r.coin?.value_dollars ?? 10) || 10;
  const signupBonus = Number(r.signup_bonus ?? 0) || 0;
  const deals = Array.isArray(r.member_deals)
    ? (r.member_deals as PubPlusDealLike[])
        .filter((d) => d && (d.title || d.description))
        .map((d) => ({ title: d.title ?? "", description: d.description ?? "" }))
    : [];

  return {
    pointsPerDollar,
    coinThreshold,
    coinValue,
    signupBonus,
    deals,
    earnLine: `Earn ${pointsPerDollar} point${pointsPerDollar === 1 ? "" : "s"} for every $1 you spend.`,
    coinLine: `${coinThreshold} points = a $${coinValue} pub+ coin to spend on food or drinks.`,
    sharedLine: "Your points work at every venue in the group — earn here, spend anywhere.",
  };
}
