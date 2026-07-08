import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useFeatures } from "@/hooks/use-features";
import { FeatureKey } from "@/lib/packages";

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** Render nothing when off. Defaults to false — shows an upgrade panel. */
  silent?: boolean;
  fallback?: ReactNode;
}

/**
 * Gate any subtree behind a feature flag. When the flag is off:
 * - `silent` → render nothing
 * - `fallback` → render that
 * - otherwise → render a simple upgrade panel
 */
export function FeatureGate({ feature, children, silent, fallback }: FeatureGateProps) {
  const { has, loading } = useFeatures();
  if (loading) return null;
  if (has(feature)) return <>{children}</>;
  if (silent) return null;
  if (fallback !== undefined) return <>{fallback}</>;
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center space-y-2">
      <Lock className="h-5 w-5 mx-auto text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Not included in your package</p>
      <p className="text-xs text-muted-foreground">
        Contact H&amp;L to upgrade and unlock this feature.
      </p>
    </div>
  );
}
