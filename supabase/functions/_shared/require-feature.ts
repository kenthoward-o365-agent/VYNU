// Shared helper: enforce that a venue has a given feature enabled.
// Mirrors the client-side `resolveFlags` from src/lib/packages.ts.

/**
 * Structural stand-in for the Supabase client. Naming the real generic type
 * (`ReturnType<typeof createClient>`) pulls in defaults that resolve selected
 * rows to `never` and reject every caller's differently-parameterised client —
 * the same failure ai-usage.ts had. Callers pass any client with .from().
 */
type FlagReader = { from: (table: string) => any };

type FeatureFlags = Record<string, boolean>;
type Tier = "bite" | "plate" | "feast" | "custom";

// Keep in sync with src/lib/packages.ts PACKAGE_PRESETS.
const PRESETS: Record<Exclude<Tier, "custom">, FeatureFlags> = {
  bite: {
    "core.menu_builder": true, "core.tables_qr": true, "core.orders_board": true,
    "pay.hl_pay_checkout": true, "pay.surcharging": true, "pay.refunds_reopen": true,
    "ai.chat_ordering": true, "ai.upsell": true,
    "crm.diner_profiles": true, "crm.preferences": true,
    "group.per_user_order_perms": true, "reporting.core_dashboard": true,
    "ops.self_onboard": true, "ops.knowledge_base": true,
  },
  plate: {
    "core.menu_builder": true, "core.tables_qr": true, "core.orders_board": true,
    "core.custom_order_statuses": true, "core.order_throttling": true,
    "core.multi_display_terminals": true, "core.session_modes_full": true,
    "pay.hl_pay_checkout": true, "pay.surcharging": true, "pay.refunds_reopen": true,
    "pay.gratuities": true, "pay.multi_tax_rules": true,
    "ai.chat_ordering": true, "ai.upsell": true, "ai.menu_import": true,
    "ai.image_single": true, "ai.modifier_gen": true, "ai.spark_analytics": true,
    "ai.copilot_full": true,
    "crm.diner_profiles": true, "crm.preferences": true, "crm.segments_rfm": true,
    "loyalty.single_venue": true, "loyalty.birthday": true,
    "merch.pricing_rules": true, "merch.time_frames": true, "merch.display_areas": true,
    "merch.landing_page_theme": true,
    "pos.hl_push": true, "pos.hl_menu_pull": true,
    "group.cross_venue_staff": true, "group.per_user_order_perms": true,
    "group.custom_roles": true, "group.dashboard": true,
    "reporting.core_dashboard": true, "reporting.ops_charts": true, "reporting.advanced": true,
    "ops.self_onboard": true, "ops.knowledge_base": true,
  },
  feast: {}, // sentinel: all-on
};

export async function hasFeature(
  supabase: FlagReader,
  venueId: string,
  key: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("venue_feature_flags")
    .select("tier, flags")
    .eq("venue_id", venueId)
    .maybeSingle();

  // No row → default to Feast (all-on) to keep legacy venues working.
  const row = data as { tier?: string; flags?: FeatureFlags } | null;
  const tier = ((row?.tier as Tier) ?? "feast");
  const overrides = (row?.flags ?? {});
  if (tier === "feast") return overrides[key] !== false;
  if (tier === "custom") return overrides[key] === true;
  const preset = PRESETS[tier];
  return overrides[key] !== undefined ? overrides[key] === true : preset[key] === true;
}

/**
 * Convenience: returns a Response (403) if the feature is off, else null.
 * Usage: `const denied = await requireFeature(sb, venueId, 'crm.email_campaigns');
 *         if (denied) return denied;`
 */
export async function requireFeature(
  supabase: FlagReader,
  venueId: string,
  key: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const ok = await hasFeature(supabase, venueId, key);
  if (ok) return null;
  return new Response(
    JSON.stringify({
      error: "feature_not_included",
      feature: key,
      message: "This feature is not included in the venue's current package.",
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
