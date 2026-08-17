// Package tiers & feature-flag presets
// Presets are pure templates — admins can override any flag per venue.
// Source of truth for both the admin editor and any runtime gate.

export type PackageTier = "bite" | "plate" | "feast" | "custom";

// All available feature keys. Keep grouped by domain for the admin UI.
export const FEATURE_GROUPS = [
  {
    id: "core",
    label: "Core ordering",
    features: [
      { key: "core.menu_builder", label: "Menu builder", note: "Categories, items, modifiers" },
      { key: "core.tables_qr", label: "Tables + QR codes" },
      { key: "core.orders_board", label: "Orders board & status flow" },
      { key: "core.custom_order_statuses", label: "Custom order statuses" },
      { key: "core.order_throttling", label: "Order throttling & kitchen pacing" },
      { key: "core.multi_display_terminals", label: "Multiple display terminals (KDS areas)" },
      { key: "core.session_modes_full", label: "All session modes (dine-in, takeaway, pickup)" },
    ],
  },
  {
    id: "payments",
    label: "Payments (VYNU Pay)",
    features: [
      { key: "pay.hl_pay_checkout", label: "VYNU Pay checkout (Apple/Google Pay, cards)" },
      { key: "pay.surcharging", label: "Surcharging configuration" },
      { key: "pay.refunds_reopen", label: "Refunds & re-open orders" },
      { key: "pay.gratuities", label: "Gratuities / tipping" },
      { key: "pay.multi_tax_rules", label: "Multi-rate & item-level tax rules" },
    ],
  },
  {
    id: "ai",
    label: "AI (Vee)",
    features: [
      { key: "ai.chat_ordering", label: "Vee AI chat ordering" },
      { key: "ai.upsell", label: "AI upsell / cart suggestions" },
      { key: "ai.menu_import", label: "AI menu import (URL / PDF)" },
      { key: "ai.image_single", label: "AI menu image generation (single)" },
      { key: "ai.image_batch", label: "AI menu image batch generator" },
      { key: "ai.modifier_gen", label: "AI modifier generation" },
      { key: "ai.spark_analytics", label: "Vee AI Analytics" },
      { key: "ai.insights", label: "AI Insights (daily narrative, anomalies)" },
      { key: "ai.copilot_full", label: "AI Co-pilot (in-app walkthroughs + chat)" },
      { key: "ai.campaign_composer", label: "AI campaign composer" },
    ],
  },
  {
    id: "crm",
    label: "Diners & CRM",
    features: [
      { key: "crm.diner_profiles", label: "Diner profiles & visit history" },
      { key: "crm.preferences", label: "Diner preferences (allergens, favourites)" },
      { key: "crm.segments_rfm", label: "RFM segments" },
      { key: "crm.segments_lookalike", label: "AI lookalike segments" },
      { key: "crm.email_campaigns", label: "Email campaigns" },
      { key: "crm.sms_campaigns", label: "SMS campaigns" },
      { key: "crm.push_campaigns", label: "Push / in-app campaigns" },
      { key: "crm.suppression", label: "Suppression list & STOP handling" },
      { key: "crm.attribution", label: "Campaign revenue attribution" },
    ],
  },
  {
    id: "loyalty",
    label: "Loyalty",
    features: [
      { key: "loyalty.single_venue", label: "Single-venue loyalty program" },
      { key: "loyalty.group", label: "Multi-venue / group loyalty" },
      { key: "loyalty.birthday", label: "Birthday rewards + auto-issue" },
    ],
  },
  {
    id: "merch",
    label: "Merchandising & pricing",
    features: [
      { key: "merch.pricing_rules", label: "Pricing rules (happy hour, member price)" },
      { key: "merch.custom_rule_types", label: "Custom rule types" },
      { key: "merch.time_frames", label: "Menu time frames" },
      { key: "merch.display_areas", label: "Multiple display areas" },
      { key: "merch.landing_page_full", label: "Landing page editor (full sections)" },
      { key: "merch.landing_page_theme", label: "Landing page theme only" },
    ],
  },
  {
    id: "pos",
    label: "POS & integrations",
    features: [
      { key: "pos.hl_push", label: "H&L Exceed POS push" },
      { key: "pos.hl_menu_pull", label: "POS menu pull / product sync" },
      { key: "pos.other_adapters", label: "Other POS adapters" },
      { key: "pos.dev_api", label: "Developer API keys & webhooks" },
      { key: "pos.partner_crm", label: "Partner CRM export" },
    ],
  },
  {
    id: "group",
    label: "Multi-venue / group",
    features: [
      { key: "group.dashboard", label: "Group dashboard (roll-up)" },
      { key: "group.cross_venue_staff", label: "Cross-venue staff & roles" },
      { key: "group.per_user_order_perms", label: "Per-user Orders permissions" },
      { key: "group.custom_roles", label: "Custom roles + permission matrix" },
    ],
  },
  {
    id: "analytics",
    label: "Reporting & analytics",
    features: [
      { key: "reporting.core_dashboard", label: "Core dashboard (revenue, orders, top items)" },
      { key: "reporting.ops_charts", label: "Revenue by hour, ticket times, table utilisation" },
      { key: "reporting.advanced", label: "Advanced reporting (custom range, exports)" },
      { key: "reporting.funnel", label: "Abandonment / funnel analytics" },
    ],
  },
  {
    id: "suite",
    label: "Guest suite",
    features: [
      { key: "concierge.inbox", label: "Concierge inbox (calls, SMS, WhatsApp)", note: "The front door — every dialogue on the guest record" },
      { key: "concierge.voice_agent", label: "Vee voice concierge", note: "AI answers, books and remembers" },
      { key: "reserve.bookings", label: "Reserve — table reservations" },
      { key: "reserve.functions", label: "Functions — event & space enquiries" },
      { key: "club.membership", label: "Club — member scheme (gaming venues)", note: "Signals are staff-side only, never diner-visible" },
      { key: "club.promo_screens", label: "Club — promo screens & campaigns" },
      { key: "discover.feed", label: "Discover — public offers & experiences feed" },
    ],
  },
  {
    id: "ops",
    label: "Ops & platform",
    features: [
      { key: "ops.self_onboard", label: "Self-onboarding wizard" },
      { key: "ops.knowledge_base", label: "In-app Knowledge Base" },
      { key: "ops.priority_support", label: "Priority support SLA" },
    ],
  },
] as const;

export type FeatureKey =
  (typeof FEATURE_GROUPS)[number]["features"][number]["key"];

export const ALL_FEATURE_KEYS: FeatureKey[] = FEATURE_GROUPS.flatMap((g) =>
  g.features.map((f) => f.key as FeatureKey),
);

export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;

// Presets — anything not listed defaults to false. `custom` has no preset.
export const PACKAGE_PRESETS: Record<Exclude<PackageTier, "custom">, FeatureFlags> = {
  bite: {
    "core.menu_builder": true,
    "core.tables_qr": true,
    "core.orders_board": true,
    "pay.hl_pay_checkout": true,
    "pay.surcharging": true,
    "pay.refunds_reopen": true,
    "ai.chat_ordering": true,
    "ai.upsell": true,
    "crm.diner_profiles": true,
    "crm.preferences": true,
    "group.per_user_order_perms": true,
    "reporting.core_dashboard": true,
    "ops.self_onboard": true,
    "ops.knowledge_base": true,
  },
  plate: {
    // Everything in Bite ...
    "core.menu_builder": true,
    "core.tables_qr": true,
    "core.orders_board": true,
    "core.custom_order_statuses": true,
    "core.order_throttling": true,
    "core.multi_display_terminals": true,
    "core.session_modes_full": true,
    "pay.hl_pay_checkout": true,
    "pay.surcharging": true,
    "pay.refunds_reopen": true,
    "pay.gratuities": true,
    "pay.multi_tax_rules": true,
    "ai.chat_ordering": true,
    "ai.upsell": true,
    "ai.menu_import": true,
    "ai.image_single": true,
    "ai.modifier_gen": true,
    "ai.spark_analytics": true,
    "ai.copilot_full": true,
    "crm.diner_profiles": true,
    "crm.preferences": true,
    "crm.segments_rfm": true,
    "loyalty.single_venue": true,
    "loyalty.birthday": true,
    "merch.pricing_rules": true,
    "merch.time_frames": true,
    "merch.display_areas": true,
    "merch.landing_page_theme": true,
    "pos.hl_push": true,
    "pos.hl_menu_pull": true,
    "group.cross_venue_staff": true,
    "group.per_user_order_perms": true,
    "group.custom_roles": true,
    "group.dashboard": true,
    "reporting.core_dashboard": true,
    "reporting.ops_charts": true,
    "reporting.advanced": true,
    "ops.self_onboard": true,
    "ops.knowledge_base": true,
    // Guest suite (deck: the $99 Suite = Reserve, Functions, Ordering,
    // Loyalty, Discover; Concierge and Club are the higher add-ons → feast).
    "reserve.bookings": true,
    "reserve.functions": true,
    "discover.feed": true,
  },
  feast: Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, true])) as FeatureFlags,
};

// Effective flags = preset for tier merged with explicit overrides.
export function resolveFlags(tier: PackageTier, overrides: FeatureFlags | null | undefined): FeatureFlags {
  if (tier === "custom") return { ...(overrides ?? {}) };
  return { ...PACKAGE_PRESETS[tier], ...(overrides ?? {}) };
}

// Does the given effective-flags map differ from the tier preset?
export function isCustomised(tier: PackageTier, effective: FeatureFlags): boolean {
  if (tier === "custom") return true;
  const preset = PACKAGE_PRESETS[tier];
  for (const key of ALL_FEATURE_KEYS) {
    if (!!preset[key] !== !!effective[key]) return true;
  }
  return false;
}

export const TIER_LABEL: Record<PackageTier, string> = {
  bite: "Bite",
  plate: "Plate",
  feast: "Feast",
  custom: "Custom",
};

export const TIER_DESCRIPTION: Record<PackageTier, string> = {
  bite: "Essentials to run a venue on VYNU — QR ordering, menu, payments, basic AI.",
  plate: "Bite + merchandising, loyalty, POS push, group tooling.",
  feast: "Full platform — CRM campaigns, advanced AI, group loyalty, developer API.",
  custom: "Bespoke — manually toggled flags for this venue.",
};
