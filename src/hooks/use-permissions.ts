import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";

export interface Permissions {
  navKeys: Set<string>;
  /** User-level: can advance order status. */
  canUpdateOrderStatus: boolean;
  /** User-level: can re-open a closed/terminal order back to an active status (no refund). */
  canReopenClosedOrders: boolean;
  /** User-level: can process refunds (which also re-opens the order). */
  canProcessRefunds: boolean;
  /**
   * @deprecated kept for backwards compatibility — equals `canProcessRefunds`.
   */
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
  canReopenClosedOrders: true,
  canProcessRefunds: true,
  canReopenAndRefund: true,
  canManageRoles: true,
  canManageSettings: true,
  isLoading: false,
};

/**
 * Loads permissions for the current user at the active venue.
 *
 * - tabless_admin and venue Owner role always get full access.
 * - Sidebar nav + manage-roles + manage-settings come from the user's role
 *   (`venue_role_permissions`).
 * - Order-action permissions (update status / re-open / refund) come from
 *   the per-user row in `venue_staff` so different users with the same role
 *   can have different in-Orders capabilities.
 */
export function usePermissions(): Permissions {
  const { user } = useAuth();
  const { venue, isTablessAdmin, venueRole } = useVenue();
  const [perms, setPerms] = useState<Omit<Permissions, "can">>({
    navKeys: new Set(),
    canUpdateOrderStatus: false,
    canReopenClosedOrders: false,
    canProcessRefunds: false,
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

      // 1. Look up the staff row for this user/venue (incl. per-user order flags)
      const { data: staffRow } = await supabase
        .from("venue_staff")
        .select(
          "role_id, role, can_update_order_status, can_reopen_closed_orders, can_process_refunds",
        )
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

      // Per-user order flags (work even if no role yet)
      const canUpdateOrderStatus = !!staffRow?.can_update_order_status;
      const canReopenClosedOrders = !!staffRow?.can_reopen_closed_orders;
      const canProcessRefunds = !!staffRow?.can_process_refunds;

      if (!roleId) {
        if (!cancelled)
          setPerms({
            navKeys: new Set(),
            canUpdateOrderStatus,
            canReopenClosedOrders,
            canProcessRefunds,
            canReopenAndRefund: canProcessRefunds,
            canManageRoles: false,
            canManageSettings: false,
            isLoading: false,
          });
        return;
      }

      const { data: rp } = await supabase
        .from("venue_role_permissions")
        .select("nav_keys, can_manage_roles, can_manage_settings")
        .eq("role_id", roleId)
        .maybeSingle();

      if (cancelled) return;

      setPerms({
        navKeys: new Set((rp?.nav_keys as string[]) || []),
        canUpdateOrderStatus,
        canReopenClosedOrders,
        canProcessRefunds,
        canReopenAndRefund: canProcessRefunds,
        canManageRoles: !!rp?.can_manage_roles,
        canManageSettings: !!rp?.can_manage_settings,
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
