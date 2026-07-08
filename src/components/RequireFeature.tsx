import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useFeatures } from "@/hooks/use-features";
import { FeatureKey } from "@/lib/packages";
import { FeatureGate } from "@/components/FeatureGate";

/**
 * Route-level guard. Redirects to /dashboard when the feature is off,
 * or renders a locked panel if `showLocked` is set.
 */
export function RequireFeature({
  feature,
  children,
  showLocked = false,
}: {
  feature: FeatureKey;
  children: ReactNode;
  showLocked?: boolean;
}) {
  const { has, loading } = useFeatures();
  if (loading) return null;
  if (has(feature)) return <>{children}</>;
  if (showLocked) {
    return (
      <div className="p-6">
        <FeatureGate feature={feature}>{children}</FeatureGate>
      </div>
    );
  }
  return <Navigate to="/dashboard" replace />;
}
