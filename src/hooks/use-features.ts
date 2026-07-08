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
 * Falls back to `feast` (all-on) if no row exists yet, so nothing breaks
 * for venues that pre-date this feature.
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

  const tier: PackageTier = (data?.tier as PackageTier) ?? "feast";
  const overrides = (data?.flags as FeatureFlags) ?? {};
  const flags = resolveFlags(tier, overrides);

  return {
    tier,
    flags,
    has: (key: FeatureKey) => flags[key] === true,
    loading: isLoading,
  };
}
