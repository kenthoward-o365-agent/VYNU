import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Totals {
  total_revenue: number;
  ai_revenue: number;
  orders: number;
  ai_orders: number;
}

export default function DinerInsights() {
  const { venue } = useVenue();
  const [totals, setTotals] = useState<Totals>({ total_revenue: 0, ai_revenue: 0, orders: 0, ai_orders: 0 });
  const [topCampaigns, setTopCampaigns] = useState<any[]>([]);
  const [tiers, setTiers] = useState<{ tier: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venue) return;
    (async () => {
      setLoading(true);
      const [{ data: attrs }, { data: camps }, { data: stats }] = await Promise.all([
        supabase.from("crm_campaign_attributions" as any).select("revenue, is_ai_generated").eq("venue_id", venue.id),
        supabase.from("crm_campaigns" as any).select("id, name, attributed_revenue, attributed_orders, is_ai_generated, channel")
          .eq("venue_id", venue.id).order("attributed_revenue", { ascending: false }).limit(5),
        supabase.from("diner_venue_stats" as any).select("rfm_tier").eq("venue_id", venue.id),
      ]);

      const t: Totals = { total_revenue: 0, ai_revenue: 0, orders: 0, ai_orders: 0 };
      for (const a of (attrs || []) as any[]) {
        const r = Number(a.revenue || 0);
        t.total_revenue += r; t.orders++;
        if (a.is_ai_generated) { t.ai_revenue += r; t.ai_orders++; }
      }
      setTotals(t);
      setTopCampaigns((camps as any[]) || []);

      const tierMap = new Map<string, number>();
      for (const s of (stats as any[]) || []) {
        const k = s.rfm_tier || "Unscored";
        tierMap.set(k, (tierMap.get(k) || 0) + 1);
      }
      setTiers(Array.from(tierMap.entries()).map(([tier, count]) => ({ tier, count })).sort((a, b) => b.count - a.count));
      setLoading(false);
    })();
  }, [venue]);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Campaign revenue" value={`$${totals.total_revenue.toFixed(2)}`} />
        <Stat label="AI-generated revenue" value={`$${totals.ai_revenue.toFixed(2)}`} accent />
        <Stat label="Attributed orders" value={totals.orders} />
        <Stat label="AI orders" value={totals.ai_orders} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Top campaigns</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topCampaigns.length === 0 && <p className="text-sm text-muted-foreground">No campaign data yet.</p>}
            {topCampaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1">
                <span className="flex items-center gap-2">{c.name}<Badge variant="outline" className="text-xs">{c.channel}</Badge>{c.is_ai_generated && <Badge className="text-xs">AI</Badge>}</span>
                <span className="font-medium">${Number(c.attributed_revenue || 0).toFixed(2)} · {c.attributed_orders} orders</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">RFM tiers</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tiers.length === 0 && <p className="text-sm text-muted-foreground">No scored diners yet.</p>}
            {tiers.map((t) => (
              <div key={t.tier} className="flex items-center justify-between text-sm border-b last:border-0 py-1">
                <span>{t.tier}</span><span className="font-medium">{t.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
