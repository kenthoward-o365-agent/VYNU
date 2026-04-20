import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Activity, Pause, Sliders, Beaker } from "lucide-react";
import { Link } from "react-router-dom";

interface AreaRow {
  id: string;
  name: string;
  color: string;
  throttle_enabled: boolean;
  throttle_mode: string;
}

interface Props {
  venueId: string;
}

const MODE_META: Record<string, { label: string; icon: typeof Activity; bg: string }> = {
  open: { label: "Open", icon: Activity, bg: "bg-emerald-500" },
  auto: { label: "Auto", icon: Sliders, bg: "bg-amber-500" },
  block: { label: "Blocked", icon: Pause, bg: "bg-destructive" },
  test: { label: "Test", icon: Beaker, bg: "bg-blue-500" },
};

export default function ThrottleStatusBar({ venueId }: Props) {
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [queueSizes, setQueueSizes] = useState<Record<string, number>>({});

  const load = async () => {
    const { data } = await supabase
      .from("venue_display_areas")
      .select("id, name, color, throttle_enabled, throttle_mode")
      .eq("venue_id", venueId)
      .eq("throttle_enabled", true)
      .eq("is_active", true)
      .order("display_order");
    setAreas((data as AreaRow[]) ?? []);

    // queue size per area = orders for venue with throttled_until>now,
    // limited by area routing — approximated by counting throttled orders for venue.
    // Fine-grained per-area count isn't critical for the strip; we use total.
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .not("throttled_until", "is", null)
      .gt("throttled_until", new Date().toISOString());
    const totals: Record<string, number> = {};
    for (const a of (data as AreaRow[]) ?? []) totals[a.id] = count ?? 0;
    setQueueSizes(totals);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`throttle-bar-${venueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_display_areas", filter: `venue_id=eq.${venueId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venueId}` }, load)
      .subscribe();
    const t = setInterval(load, 30_000);
    return () => { supabase.removeChannel(channel); clearInterval(t); };
  }, [venueId]);

  if (areas.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground mr-1">Stations:</span>
      {areas.map((a) => {
        const meta = MODE_META[a.throttle_mode] ?? MODE_META.open;
        const Icon = meta.icon;
        return (
          <Link
            key={a.id}
            to="/orders/throttling"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 hover:bg-muted/40 transition-colors"
          >
            <span className={`h-2 w-2 rounded-full ${meta.bg}`} />
            <span className="text-xs font-medium text-foreground">{a.name}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1">
              <Icon className="h-2.5 w-2.5" />
              {meta.label}
            </Badge>
            {queueSizes[a.id] > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {queueSizes[a.id]}
              </Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}
