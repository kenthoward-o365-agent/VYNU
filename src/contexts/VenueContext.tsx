import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Venue {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
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
  venueRole: string | null;
  loading: boolean;
  setVenue: (v: Venue | null) => void;
  switchVenue: (venueId: string) => void;
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
      setLoading(false);
      return;
    }

    setLoading(true);

    if (!session?.access_token) {
      setLoading(true);
      return;
    }

    const queryClient = createSessionClient(session.access_token);

    const { data: staffData } = await queryClient
      .from("venue_staff")
      .select("venue_id, role")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const staffRoles = Object.fromEntries((staffData || []).map((s) => [s.venue_id, s.role]));
    setStaffRolesMap(staffRoles);
    const venueIds = (staffData || []).map((s) => s.venue_id);

    const { data: roleData } = await queryClient
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "tabless_admin" as any)
      .maybeSingle();

    const adminFlag = !!roleData;
    setIsTablessAdmin(adminFlag);

    if (venueIds.length > 0 || adminFlag) {
      let allVenues: Venue[] = [];

      if (adminFlag) {
        const { data: venueData } = await queryClient.from("venues").select("*");
        allVenues = (venueData || []) as Venue[];
      } else {
        const { data: venueData } = await queryClient.from("venues").select("*").in("id", venueIds);
        allVenues = (venueData || []) as Venue[];
      }

      setVenues(allVenues);

      const savedId = localStorage.getItem("tabless_active_venue");
      const saved = allVenues.find((v) => v.id === savedId);
      const active = saved || allVenues[0] || null;
      setVenue(active);
      setVenueRole(active ? staffRoles[active.id] || (adminFlag ? "owner" : null) : null);

      const { data: groupStaff } = await queryClient
        .from("venue_group_staff")
        .select("group_id, role")
        .eq("user_id", user.id);

      if (adminFlag) {
        const { data: allGroups } = await queryClient.from("venue_groups").select("*");
        setGroups((allGroups || []) as VenueGroup[]);
        setIsGroupAdmin(true);
        if (active?.group_id) {
          const activeGroup = (allGroups || []).find((g: any) => g.id === active.group_id);
          setGroup((activeGroup as VenueGroup) || null);
        }
      } else if (groupStaff && groupStaff.length > 0) {
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
    }

    setLoading(false);
  };

  const switchVenue = (venueId: string) => {
    const found = venues.find((v) => v.id === venueId);
    if (found) {
      setVenue(found);
      setVenueRole(staffRolesMap[venueId] || (isTablessAdmin ? "owner" : null));
      localStorage.setItem("tabless_active_venue", venueId);
      if (found.group_id) {
        const g = groups.find((gr) => gr.id === found.group_id);
        setGroup(g || null);
      } else {
        setGroup(null);
      }
    }
  };

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (user && !session?.access_token) {
      setLoading(true);
      return;
    }

    fetchVenues();
  }, [authLoading, user, session?.access_token]);

  return (
    <VenueContext.Provider value={{ venue, venues, group, groups, isGroupAdmin, isTablessAdmin, venueRole, loading, setVenue, switchVenue, refetch: fetchVenues }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
