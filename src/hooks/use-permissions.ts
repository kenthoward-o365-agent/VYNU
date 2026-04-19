import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";

export interface Permissions {
  navKeys: Set<string>;
  canUpdateOrderStatus: boolean;
  canReopenAndRefund: boolean;
  canManageRoles: boolean;
  canManageSettings: boolean;
  isLoading: boolean;
  /** Returns true if the role has access to the given top-level nav key. */
  can: (navKey: string) => boolean;
}

const ALL_ACCESS: Omit<Permissions, "can"> = {
  navKeys: new Set<string>(),
  canUpdateOrderStatus: true,
  canReopenAndRefund: true,
  canManageRoles: true,
  canManageSettings: true,
  isLoading: false,
};

/**
 * Loads the active venue's role permissions for the current user.
 *
 * - tabless_admin and venue Owner role always get full access.
 * - Otherwise we look up venue_staff.role_id -> venue_role_permissions.
 * - If no role_id is set yet (legacy users), we fall back to the legacy
 *   enum role on venue_staff (owner/manager/staff).
 */
export function usePermissions(): Permissions {
  const { user } = useAuth();
  const { venue, isTablessAdmin, venueRole } = useVenue();
  const [perms, setPerms] = useState<Omit<Permissions, "can">>({
    navKeys: new Set(),
    canUpdateOrderStatus: false,
    canReopenAndRefund: false,
    canManageRoles: false,
    canManageSettings: false,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Admins / owners — full access shortcut
      if (isTablessAdmin || venueRole === "owner") {
        if (!cancelled) setPerms({ ...ALL_ACCESS, navKeys: new Set(["*"]) });
        return;
      }

      if (!user || !venue) {
        if (!cancelled) setPerms((p) => ({ ...p, isLoading: false }));
        return;
      }

      // 1. Look up the staff row for this user/venue
      const { data: staffRow } = await supabase
        .from("venue_staff")
        .select("role_id, role")
        .eq("user_id", user.id)
        .eq("venue_id", venue.id)
        .maybeSingle();

      let roleId = staffRow?.role_id as string | null | undefined;

      // 2. Legacy fallback: if staff has no role_id, find the seeded system
      //    role with a name matching their enum role.
      if (!roleId && staffRow?.role) {
        const { data: legacyRole } = await supabase
          .from("venue_roles")
          .select("id")
          .eq("venue_id", venue.id)
          .eq("is_system", true)
          .ilike("name", staffRow.role)
          .maybeSingle();
        roleId = legacyRole?.id;
      }

      if (!roleId) {
        if (!cancelled) setPerms((p) => ({ ...p, isLoading: false }));
        return;
      }

      const { data: rp } = await supabase
        .from("venue_role_permissions")
        .select("*")
        .eq("role_id", roleId)
        .maybeSingle();

      if (cancelled) return;

      if (!rp) {
        setPerms((p) => ({ ...p, isLoading: false }));
        return;
      }

      setPerms({
        navKeys: new Set((rp.nav_keys as string[]) || []),
        canUpdateOrderStatus: !!rp.can_update_order_status,
        canReopenAndRefund: !!rp.can_reopen_and_refund_orders,
        canManageRoles: !!rp.can_manage_roles,
        canManageSettings: !!rp.can_manage_settings,
        isLoading: false,
      });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, venue?.id, isTablessAdmin, venueRole]);

  const can = (navKey: string) => {
    if (perms.navKeys.has("*")) return true;
    return perms.navKeys.has(navKey);
  };

  return { ...perms, can };
}

/** Stable nav keys used across the app. Sub-items inherit their parent's key. */
export const NAV_KEYS = {
  dashboard: "dashboard",
  orders: "orders",
  tables: "tables",
  menu: "menu",
  modifiers: "menu", // sub-item of menu
  pricing: "pricing",
  rule_types: "pricing", // sub-item
  order_statuses: "orders", // sub-item
  diners: "diners",
  loyalty: "loyalty",
  analytics: "analytics",
  sippa_analytics: "sippa_analytics",
  knowledge_base: "knowledge_base",
  settings: "settings",
} as const;

/** Top-level nav items used in the role editor checklist. */
export const TOP_LEVEL_NAV: Array<{ key: string; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders (incl. Display System)" },
  { key: "tables", label: "Tables & QR" },
  { key: "menu", label: "Menu Builder (incl. Modifiers)" },
  { key: "pricing", label: "Pricing (incl. Rule Types)" },
  { key: "diners", label: "Diners" },
  { key: "loyalty", label: "Loyalty" },
  { key: "analytics", label: "Analytics" },
  { key: "sippa_analytics", label: "L.O.U. AI Analytics" },
  { key: "knowledge_base", label: "Knowledge Base" },
  { key: "settings", label: "Settings" },
];
