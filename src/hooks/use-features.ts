import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import {
  FeatureFlags,
  FeatureKey,
  PackageTier,
  resolveFlags,
} from "@/lib/packages";

interface FeaturesResult {
  tier: PackageTier;
  flags: FeatureFlags;
  has: (key: FeatureKey) => boolean;
  loading: boolean;
}

/**
 * Reads the current venue's package tier + feature flags.
 * Falls back to the base tier `bite` (fail-closed) when no row exists, so
 * an unprovisioned/misconfigured venue does not silently receive every
 * gated feature. Existing venues are backfilled with an explicit
 * `venue_feature_flags` row (see migration) so they retain their features.
 */
export function useFeatures(): FeaturesResult {
  const { venue } = useVenue();
  const venueId = venue?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["venue_feature_flags", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_feature_flags")
        .select("tier, flags")
        .eq("venue_id", venueId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tier: PackageTier = (data?.tier as PackageTier) ?? "bite";
  const overrides = (data?.flags as FeatureFlags) ?? {};
  const flags = resolveFlags(tier, overrides);

  return {
    tier,
    flags,
    has: (key: FeatureKey) => flags[key] === true,
    loading: isLoading,
  };
}
