import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

export function VenueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [group, setGroup] = useState<VenueGroup | null>(null);
  const [groups, setGroups] = useState<VenueGroup[]>([]);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [isTablessAdmin, setIsTablessAdmin] = useState(false);
  const [venueRole, setVenueRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVenues = async () => {
    if (!user) { setVenue(null); setVenues([]); setGroup(null); setGroups([]); setIsGroupAdmin(false); setIsTablessAdmin(false); setVenueRole(null); setLoading(false); return; }
    setLoading(true);

    // Fetch all venue_staff records for this user
    const { data: staffData } = await supabase
      .from("venue_staff")
      .select("venue_id")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const venueIds = (staffData || []).map((s) => s.venue_id);

    if (venueIds.length > 0) {
      const { data: venueData } = await supabase
        .from("venues")
        .select("*")
        .in("id", venueIds);

      const allVenues = (venueData || []) as Venue[];
      setVenues(allVenues);

      // Restore last selected venue or pick first
      const savedId = localStorage.getItem("tabless_active_venue");
      const saved = allVenues.find((v) => v.id === savedId);
      const active = saved || allVenues[0] || null;
      setVenue(active);

      // Fetch groups
      const { data: groupStaff } = await supabase
        .from("venue_group_staff")
        .select("group_id, role")
        .eq("user_id", user.id);

      if (groupStaff && groupStaff.length > 0) {
        const groupIds = groupStaff.map((g) => g.group_id);
        const { data: groupData } = await supabase
          .from("venue_groups")
          .select("*")
          .in("id", groupIds);

        setGroups((groupData || []) as VenueGroup[]);
        setIsGroupAdmin(groupStaff.some((g) => g.role === "group_admin"));

        // Set current group from active venue
        if (active?.group_id) {
          const activeGroup = (groupData || []).find((g: any) => g.id === active.group_id);
          setGroup(activeGroup as VenueGroup || null);
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

    // Check tabless_admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "tabless_admin" as any)
      .maybeSingle();
    setIsTablessAdmin(!!roleData);

    setLoading(false);
  };

  const switchVenue = (venueId: string) => {
    const found = venues.find((v) => v.id === venueId);
    if (found) {
      setVenue(found);
      localStorage.setItem("tabless_active_venue", venueId);
      // Update group context
      if (found.group_id) {
        const g = groups.find((gr) => gr.id === found.group_id);
        setGroup(g || null);
      } else {
        setGroup(null);
      }
    }
  };

  useEffect(() => { fetchVenues(); }, [user]);

  return (
    <VenueContext.Provider value={{ venue, venues, group, groups, isGroupAdmin, isTablessAdmin, loading, setVenue, switchVenue, refetch: fetchVenues }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
