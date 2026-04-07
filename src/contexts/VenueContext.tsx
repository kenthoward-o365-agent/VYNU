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
}

interface VenueContextType {
  venue: Venue | null;
  loading: boolean;
  setVenue: (v: Venue | null) => void;
  refetch: () => Promise<void>;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

export function VenueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVenue = async () => {
    if (!user) { setVenue(null); setLoading(false); return; }
    setLoading(true);
    const { data: staffData } = await supabase
      .from("venue_staff")
      .select("venue_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (staffData?.venue_id) {
      const { data: venueData } = await supabase
        .from("venues")
        .select("*")
        .eq("id", staffData.venue_id)
        .single();
      setVenue(venueData as Venue | null);
    } else {
      setVenue(null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchVenue(); }, [user]);

  return (
    <VenueContext.Provider value={{ venue, loading, setVenue, refetch: fetchVenue }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error("useVenue must be used within VenueProvider");
  return ctx;
}
