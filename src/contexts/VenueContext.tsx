import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

// Sensitive columns (email, phone, subscription_*) are NOT selectable by
// authenticated/anon roles — fetch them via the get_venue_admin_detail RPC.
const VENUE_COLUMNS =
  "id, name, venue_type, address, city, state, postcode, country, logo_url, operating_hours, timezone, settings, is_active, group_id, landing_page_html";

interface Venue {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  logo_url: string | null;
  operating_hours: any;
  timezone: string | null;
  settings: any;
  is_active: boolean | null;
  group_id: string | null;
  landing_page_html: string | null;
}

interface VenueGroup {
  id: string;
  name: string;
  logo_url: string | null;
  settings: any;
}

interface VenueContextType {
  venue: Venue | null;
  venues: Venue[];
  group: VenueGroup | null;
  groups: VenueGroup[];
  isGroupAdmin: boolean;
  isTablessAdmin: boolean;
  hasProvisioningResolved: boolean;
  needsVenueChoice: boolean;
  venueRole: string | null;
  loading: boolean;
  setVenue: (v: Venue | null) => void;
  switchVenue: (venueId: string) => void;
  setPrimaryVenue: (venueId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

const createSessionClient = (accessToken: string) =>
  createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

export function VenueProvider({ children }: { children: ReactNode }) {
  const { user, session, loading: authLoading } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [group, setGroup] = useState<VenueGroup | null>(null);
  const [groups, setGroups] = useState<VenueGroup[]>([]);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [isTablessAdmin, setIsTablessAdmin] = useState(false);
  const [venueRole, setVenueRole] = useState<string | null>(null);
  const [staffRolesMap, setStaffRolesMap] = useState<Record<string, string>>({});
  const [resolvedAccessUserId, setResolvedAccessUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVenues = async () => {
    if (!user) {
      setVenue(null);
      setVenues([]);
      setGroup(null);
      setGroups([]);
      setIsGroupAdmin(false);
      setIsTablessAdmin(false);
      setVenueRole(null);
      setStaffRolesMap({});
      setResolvedAccessUserId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (!session?.access_token) {
      setResolvedAccessUserId(null);
      setLoading(true);
      return;
    }

    const queryClient = createSessionClient(session.access_token);

    // These three queries decide whether AppRoutes signs the user out as
    // "not provisioned", so a transient error must NEVER read as "no access"
    // — that was the intermittent kicked-back-to-sign-in bug. Retry briefly;
    // on persistent failure return WITHOUT setting resolvedAccessUserId, so
    // the app stays on the loading screen and the effect refetches when a
    // fresh token arrives, instead of resolving to an empty result.
    const loadAccess = async () => {
      const staffRes = await queryClient
        .from("venue_staff")
        .select("venue_id, role, is_primary")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (staffRes.error) throw staffRes.error;

      const roleRes = await queryClient
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "tabless_admin" as any)
        .maybeSingle();
      if (roleRes.error) throw roleRes.error;

      const ids = (staffRes.data || []).map((s) => s.venue_id);
      let venueRows: Venue[] = [];
      if (ids.length > 0) {
        const venueRes = await queryClient.from("venues").select(VENUE_COLUMNS).in("id", ids);
        if (venueRes.error) throw venueRes.error;
        venueRows = (venueRes.data || []) as Venue[];
      }
      return { staffData: staffRes.data || [], adminFlag: !!roleRes.data, venueRows };
    };

    let access: Awaited<ReturnType<typeof loadAccess>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3 && !access; attempt++) {
      try {
        access = await loadAccess();
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (!access) {
      console.error("VenueContext: access fetch failed after retries:", lastError);
      toast.error("Couldn't load your venue access — check your connection and try again.");
      setLoading(false);
      return;
    }

    const { staffData, adminFlag } = access;
    const staffRoles = Object.fromEntries(staffData.map((s) => [s.venue_id, s.role]));
    setStaffRolesMap(staffRoles);
    const venueIds = staffData.map((s) => s.venue_id);
    const primaryVenueId = (staffData as any[]).find((s) => s.is_primary)?.venue_id ?? null;

    setIsTablessAdmin(adminFlag);

    // Venue access is earned through `venue_staff` only — the tabless_admin
    // role grants the platform Admin section, never venue operations. An admin
    // who is also staff somewhere gets that venue at that staff role, exactly
    // like any other operator.
    if (venueIds.length > 0) {
      const allVenues = access.venueRows;

      setVenues(allVenues);

      const savedId = localStorage.getItem("tabless_active_venue");
      const saved = allVenues.find((v) => v.id === savedId);
      const primary = primaryVenueId ? allVenues.find((v) => v.id === primaryVenueId) : null;

      // Resolution order:
      //  1. Explicit saved selection in this browser (only if user still has access)
      //  2. Server-side primary venue (`venue_staff.is_primary`)
      //  3. Auto-pick only when the user has exactly one venue
      //  4. Otherwise leave null and force a chooser
      //
      // Admins only ever get (1). Entering a venue must be a deliberate act —
      // signing in with its Site ID, which is what writes that saved selection.
      // Falling back to a primary/auto-pick would drop an admin into venue
      // context when they signed in to do platform work.
      let active: Venue | null = saved || (adminFlag ? null : primary) || null;
      if (!active && !adminFlag && allVenues.length === 1) {
        active = allVenues[0];
      }
      setVenue(active);
      setVenueRole(active ? staffRoles[active.id] ?? null : null);

      const { data: groupStaff } = await queryClient
        .from("venue_group_staff")
        .select("group_id, role")
        .eq("user_id", user.id);

      if (groupStaff && groupStaff.length > 0) {
        const groupIds = groupStaff.map((g) => g.group_id);
        const { data: groupData } = await queryClient.from("venue_groups").select("*").in("id", groupIds);

        setGroups((groupData || []) as VenueGroup[]);
        setIsGroupAdmin(groupStaff.some((g) => g.role === "group_admin"));

        if (active?.group_id) {
          const activeGroup = (groupData || []).find((g: any) => g.id === active.group_id);
          setGroup((activeGroup as VenueGroup) || null);
        }
      } else {
        setGroups([]);
        setIsGroupAdmin(false);
        setGroup(null);
      }
    } else {
      setVenue(null);
      setVenues([]);
      setGroup(null);
      setGroups([]);
      setIsGroupAdmin(false);
      setVenueRole(null);
    }

    setResolvedAccessUserId(user.id);
    setLoading(false);
  };

  const switchVenue = (venueId: string) => {
    const found = venues.find((v) => v.id === venueId);
    if (found) {
      setVenue(found);
      setVenueRole(staffRolesMap[venueId] ?? null);
      localStorage.setItem("tabless_active_venue", venueId);
      if (found.group_id) {
        const g = groups.find((gr) => gr.id === found.group_id);
        setGroup(g || null);
      } else {
        setGroup(null);
      }
    }
  };

  const setPrimaryVenue = async (venueId: string) => {
    const { error } = await supabase.rpc("set_primary_venue", { _venue_id: venueId });
    if (error) throw error;
    switchVenue(venueId);
  };

  const needsVenueChoice =
    !!user &&
    resolvedAccessUserId === user.id &&
    !venue &&
    // Admins land on the Admin section with no venue by design — the blocking
    // chooser would trap them there.
    !isTablessAdmin &&
    venues.length > 1;

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      fetchVenues();
      return;
    }

    if (!session?.access_token) {
      setLoading(true);
      return;
    }

    // Avoid refetching on token refresh (e.g. when the user returns from
    // another browser tab) — that wipes in-flight form state on Settings
    // pages. Only refetch when the actual user identity changes.
    if (resolvedAccessUserId === user.id) return;

    fetchVenues();
  }, [authLoading, user?.id, session?.access_token, resolvedAccessUserId]);

  const hasProvisioningResolved = !user || resolvedAccessUserId === user.id;

  return (
    <VenueContext.Provider value={{ venue, venues, group, groups, isGroupAdmin, isTablessAdmin, hasProvisioningResolved, needsVenueChoice, venueRole, loading, setVenue, switchVenue, setPrimaryVenue, refetch: fetchVenues }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
