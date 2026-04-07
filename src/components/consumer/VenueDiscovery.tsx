import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, ExternalLink } from "lucide-react";

interface SiblingVenue {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  city: string | null;
  logo_url: string | null;
}

interface VenueDiscoveryProps {
  currentVenueId: string;
  groupId: string | null;
}

const VenueDiscovery = ({ currentVenueId, groupId }: VenueDiscoveryProps) => {
  const [venues, setVenues] = useState<SiblingVenue[]>([]);

  useEffect(() => {
    if (!groupId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("venues")
        .select("id, name, venue_type, address, city, logo_url")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .neq("id", currentVenueId)
        .order("name");
      setVenues((data || []) as SiblingVenue[]);
    };
    fetch();
  }, [groupId, currentVenueId]);

  if (!groupId || venues.length === 0) return null;

  return (
    <div className="px-4 py-6">
      <h3 className="text-base font-semibold text-foreground mb-3">Discover More Venues</h3>
      <div className="space-y-3">
        {venues.map((v) => (
          <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {v.logo_url ? (
                <img src={v.logo_url} alt={v.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl">🍽️</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{v.name}</p>
              {(v.city || v.address) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {v.city || v.address}
                </p>
              )}
              <p className="text-xs text-muted-foreground capitalize">{v.venue_type}</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default VenueDiscovery;
