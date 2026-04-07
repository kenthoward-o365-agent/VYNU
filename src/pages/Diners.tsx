import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Mail, Phone, AlertTriangle } from "lucide-react";

interface DinerWithVisits {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  allergens: string[];
  preferences: any;
  visit_count: number;
  last_visit: string | null;
}

export default function Diners() {
  const { venue } = useVenue();
  const [diners, setDiners] = useState<DinerWithVisits[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venue) return;
    const fetch = async () => {
      setLoading(true);
      const { data: visits } = await supabase
        .from("diner_visits")
        .select("diner_id, visited_at")
        .eq("venue_id", venue.id)
        .order("visited_at", { ascending: false });

      if (!visits || visits.length === 0) { setDiners([]); setLoading(false); return; }

      const dinerMap = new Map<string, { count: number; last: string }>();
      visits.forEach((v) => {
        const existing = dinerMap.get(v.diner_id);
        if (!existing) dinerMap.set(v.diner_id, { count: 1, last: v.visited_at });
        else existing.count++;
      });

      const dinerIds = Array.from(dinerMap.keys());
      const { data: profiles } = await supabase
        .from("diner_profiles")
        .select("*")
        .in("id", dinerIds);

      const result: DinerWithVisits[] = (profiles || []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        phone: p.phone,
        allergens: p.allergens || [],
        preferences: p.preferences,
        visit_count: dinerMap.get(p.id)?.count || 0,
        last_visit: dinerMap.get(p.id)?.last || null,
      }));

      result.sort((a, b) => b.visit_count - a.visit_count);
      setDiners(result);
      setLoading(false);
    };
    fetch();
  }, [venue]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Diners</h2>
        <p className="text-muted-foreground">CRM — track guests who've dined at {venue?.name}</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : diners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No diner data yet. Diners will appear here once orders come in.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {diners.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{d.display_name || "Anonymous Diner"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {d.email}
                  </div>
                )}
                {d.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {d.phone}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{d.visit_count} visit{d.visit_count !== 1 ? "s" : ""}</span>
                  {d.last_visit && (
                    <span className="text-xs text-muted-foreground">
                      Last: {new Date(d.last_visit).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {d.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    {d.allergens.map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
