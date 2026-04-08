import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";
import type { DateRange } from "@/components/AuditDatePicker";

interface Props {
  venueId: string;
  auditDate: DateRange;
}

interface StageTiming {
  label: string;
  avgMinutes: number | null;
}

const STAGES: [string, string, string][] = [
  ["received", "preparing", "Received → Preparing"],
  ["preparing", "ready", "Preparing → Ready"],
  ["ready", "served", "Ready → Served"],
];

export default function TicketTimesCard({ venueId, auditDate }: Props) {
  const [timings, setTimings] = useState<StageTiming[]>([]);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      // Get orders for venue in date range
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("venue_id", venueId)
        .gte("created_at", auditDate.from.toISOString())
        .lte("created_at", auditDate.to.toISOString());

      if (!orders?.length) { setTimings([]); setHasData(false); return; }

      const orderIds = orders.map((o) => o.id);
      const { data: logs } = await supabase
        .from("order_status_log")
        .select("order_id, status, changed_at")
        .in("order_id", orderIds)
        .order("changed_at", { ascending: true });

      if (!logs?.length) { setTimings([]); setHasData(false); return; }

      // Group by order
      const byOrder = new Map<string, { status: string; changed_at: string }[]>();
      for (const log of logs) {
        const arr = byOrder.get(log.order_id) || [];
        arr.push({ status: log.status, changed_at: log.changed_at });
        byOrder.set(log.order_id, arr);
      }

      const results: StageTiming[] = STAGES.map(([from, to, label]) => {
        const durations: number[] = [];
        for (const [, entries] of byOrder) {
          const fromEntry = entries.find((e) => e.status === from);
          const toEntry = entries.find((e) => e.status === to);
          if (fromEntry && toEntry) {
            const diff = (new Date(toEntry.changed_at).getTime() - new Date(fromEntry.changed_at).getTime()) / 60000;
            if (diff > 0 && diff < 480) durations.push(diff);
          }
        }
        return {
          label,
          avgMinutes: durations.length ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 : null,
        };
      });

      setTimings(results);
      setHasData(results.some((t) => t.avgMinutes !== null));
    };
    fetch();
  }, [venueId, auditDate]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Avg Ticket Times</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ticket time tracking is now active. Data will appear as orders are processed.
          </p>
        ) : (
          <div className="space-y-3">
            {timings.map((t) => (
              <div key={t.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t.label}</span>
                <span className="text-sm font-semibold text-foreground">
                  {t.avgMinutes !== null ? `${t.avgMinutes} min` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
