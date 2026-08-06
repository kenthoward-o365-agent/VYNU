import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  FeatureFlags,
  FeatureKey,
  PackageTier,
  resolveFlags,
} from "@/lib/packages";

interface GuestFeaturesResult {
  has: (key: FeatureKey) => boolean;
  loading: boolean;
}

/**
 * Package feature flags for the guest ordering app.
 *
 * Separate from `useFeatures` for two reasons:
 *
 *  1. `useFeatures` reads `venue_feature_flags` directly and depends on
 *     `VenueContext`, which is the operator dashboard's notion of "the current
 *     venue". The guest app has no such context — it works from the route's
 *     venue id — and an anonymous diner cannot read that table at all, since
 *     both its RLS policies are TO authenticated. Hence the
 *     `get_venue_package_public` RPC.
 *
 *  2. The two disagree on what an unprovisioned venue gets. `useFeatures`
 *     defaults to `bite` (fail-closed); the server's `hasFeature` in
 *     _shared/require-feature.ts defaults to `feast` (fail-open, "to keep
 *     legacy venues working").
 *
 * This hook deliberately mirrors the SERVER, not the dashboard. If it
 * fail-closed while the server fail-opened, a venue with no package row would
 * have features hidden in the UI but still served by the endpoints — the same
 * class of inconsistency this ticket is fixing, pointing the other way. In
 * production three venues currently have no package row, including the RFP demo
 * venue, so defaulting to bite here would silently strip their features.
 *
 * When the fail-closed decision is implemented, change it here and in
 * _shared/require-feature.ts together, after those venues are backfilled.
 */
export function useGuestFeatures(venueId: string | undefined): GuestFeaturesResult {
  const { data, isLoading } = useQuery({
    queryKey: ["guest_venue_package", venueId],
    enabled: !!venueId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Cast: src/integrations/supabase/types.ts is generated from the database
      // and does not know this RPC until the migration in this change has been
      // applied. Same pattern used elsewhere for newly added RPCs.
      const { data, error } = await (supabase as any).rpc("get_venue_package_public", {
        _venue_id: venueId!,
      });
      if (error) throw error;
      // The RPC returns a set; no row means the venue has no package configured.
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as { tier: string | null; flags: FeatureFlags | null } | null;
    },
  });

  // No row, or the lookup failed: match the server's fail-open default so the
  // UI and the endpoints agree. A venue that has a package configured is still
  // gated normally.
  const rawTier = data?.tier;
  const tier: PackageTier =
    rawTier === "bite" || rawTier === "plate" || rawTier === "feast" || rawTier === "custom"
      ? rawTier
      : "feast";
  const overrides = (data?.flags as FeatureFlags) ?? {};

  // Mirror require-feature.ts behavior: on feast, a key is enabled unless explicitly overridden to false.
  const resolved = tier !== "feast" && tier !== "custom" ? resolveFlags(tier, overrides) : null;
  const has = (key: FeatureKey): boolean => {
    if (tier === "feast") return overrides[key] !== false;
    if (tier === "custom") return overrides[key] === true;
    return resolved?.[key] === true;
  };

  return {
    // While loading, report features as available. The endpoints enforce
    // independently, so the cost of being wrong for a moment is a control that
    // briefly appears and then hides — preferable to every venue's chat tab
    // flickering in on load, which is the common case.
    has: (key: FeatureKey) => (isLoading ? true : has(key)),
    loading: isLoading,
  };
}
