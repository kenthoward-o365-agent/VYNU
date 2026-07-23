import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useVenue } from "@/contexts/VenueContext";

/**
 * Route-level guard for platform-admin (`tabless_admin`) pages.
 * Redirects non-admins to /dashboard.
 *
 * NOTE: This is a defense-in-depth / UX control only. The authoritative
 * enforcement lives server-side (admin Edge Functions verify tabless_admin,
 * and admin data is gated by RLS). Hiding the nav link is not enough — the
 * route itself must not mount for non-admins.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isTablessAdmin, hasProvisioningResolved } = useVenue();
  if (!hasProvisioningResolved) return null;
  if (!isTablessAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
