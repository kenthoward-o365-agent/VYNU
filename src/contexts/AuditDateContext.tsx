import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";

interface AuditDateContextType {
  auditDate: string | null; // YYYY-MM-DD
  loading: boolean;
  advanceDay: () => Promise<string | null>;
  /** Re-read the audit date, e.g. after the dayend-close function advanced it. */
  refresh: () => Promise<void>;
}

const AuditDateContext = createContext<AuditDateContextType>({
  auditDate: null,
  loading: true,
  advanceDay: async () => null,
  refresh: async () => {},
});

export function useAuditDate() {
  return useContext(AuditDateContext);
}

export function AuditDateProvider({ children }: { children: ReactNode }) {
  const { venue } = useVenue();
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venue) { setLoading(false); return; }

    const init = async () => {
      setLoading(true);
      // Try to read existing audit date
      const { data } = await supabase
        .from("venue_audit_dates")
        .select("audit_date")
        .eq("venue_id", venue.id)
        .maybeSingle();

      if (data?.audit_date) {
        setAuditDate(data.audit_date);
      } else {
        // Initialize via RPC
        const { data: dateResult } = await supabase.rpc("initialize_venue_audit_date", {
          _venue_id: venue.id,
        });
        if (dateResult) setAuditDate(dateResult as string);
      }
      setLoading(false);
    };
    init();
  }, [venue?.id]);

  const refresh = useCallback(async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("venue_audit_dates")
      .select("audit_date")
      .eq("venue_id", venue.id)
      .maybeSingle();
    if (data?.audit_date) setAuditDate(data.audit_date);
  }, [venue?.id]);

  const advanceDay = useCallback(async () => {
    if (!venue) return null;
    const { data, error } = await supabase.rpc("advance_audit_date", {
      _venue_id: venue.id,
    });
    if (error) { console.error("advance_audit_date error:", error); return null; }
    const newDate = data as string;
    setAuditDate(newDate);
    return newDate;
  }, [venue?.id]);

  return (
    <AuditDateContext.Provider value={{ auditDate, loading, advanceDay, refresh }}>
      {children}
    </AuditDateContext.Provider>
  );
}
