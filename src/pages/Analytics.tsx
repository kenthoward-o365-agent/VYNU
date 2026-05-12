import { useEffect, useMemo, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { useAuditDate } from "@/contexts/AuditDateContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import {
  TrendingUp, DollarSign, ShoppingCart, BarChart3, Sparkles,
  Flame, Snowflake, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  price: number;
  foodCost: number | null;
  qty: number;
  revenue: number;
  mixPct: number;
  revPct: number;
  foodCostPct: number | null;
  grossMargin: number | null;
};

type Insights = {
  summary: {
    windowDays: number;
    orderCount: number;
    totalRevenue: number;
    totalUnitsSold: number;
    menuSize: number;
    itemsWithFoodCost: number;
  };
  topSellers: Row[];
  topRevenue: Row[];
  slowMovers: Row[];
  lossLeaders: Row[];
  foodCostAlerts: Row[];
  recommendations: string[];
  aiError: string | null;
  generatedAt: string;
};

const fmt$ = (n: number) => `$${(n || 0).toFixed(2)}`;
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(0)}%`;

export default function Analytics() {
  const { venue } = useVenue();
  const { auditDate: venueAuditDate } = useAuditDate();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>(() => {
    // Default: Last 30 Days, anchored to venue audit date when available
    const today = venueAuditDate ? new Date(venueAuditDate) : new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    const to = new Date(today);
    to.setHours(23, 59, 59, 999);
    return { from, to, label: "Last 30 Days" };
  });

  // When venue audit date loads, re-anchor default range
  useEffect(() => {
    if (!venueAuditDate) return;
    setRange((prev) => {
      if (prev.label !== "Last 30 Days") return prev;
      const today = new Date(venueAuditDate);
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      const to = new Date(today);
      to.setHours(23, 59, 59, 999);
      return { from, to, label: "Last 30 Days" };
    });
  }, [venueAuditDate]);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("ai-insights", {
      body: {
        venueId: venue.id,
        fromIso: range.from.toISOString(),
        toIso: range.to.toISOString(),
        rangeLabel: range.label,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load insights");
      return;
    }
    if ((res as any)?.error) {
      toast.error((res as any).error);
      return;
    }
    setData(res as Insights);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id, range.from.getTime(), range.to.getTime()]);

  const s = data?.summary;
  const avg = s && s.orderCount ? s.totalRevenue / s.orderCount : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Analytics</h2>
          <p className="text-muted-foreground">
            Performance & revenue insights for {venue?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AuditDatePicker value={range} onChange={setRange} auditDateOverride={venueAuditDate} />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Total Revenue" value={fmt$(s?.totalRevenue ?? 0)} icon={<DollarSign className="h-4 w-4 text-emerald-500" />} loading={loading && !data} />
        <StatCard label="Completed Orders" value={String(s?.orderCount ?? 0)} icon={<ShoppingCart className="h-4 w-4 text-blue-500" />} loading={loading && !data} />
        <StatCard label="Avg Check Size" value={fmt$(avg)} icon={<TrendingUp className="h-4 w-4 text-purple-500" />} loading={loading && !data} />
      </div>

      {/* AI Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Spark Recommendations
          </CardTitle>
          <CardDescription>
            AI-generated, prioritised actions based on the last {days} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          ) : data?.recommendations?.length ? (
            <ul className="space-y-2">
              {data.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 text-primary">•</span>
                  <span className="text-foreground">{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {data?.aiError
                ? `AI unavailable: ${data.aiError}`
                : "Not enough data yet. Recommendations appear once orders are flowing."}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <ItemTable
          title="Product Mix — Top Sellers"
          icon={<Flame className="h-5 w-5 text-orange-500" />}
          description="Highest-volume items in the window"
          rows={data?.topSellers ?? []}
          loading={loading && !data}
          showMix
        />
        <ItemTable
          title="Product Mix — Top Revenue"
          icon={<BarChart3 className="h-5 w-5 text-emerald-500" />}
          description="Items contributing the most revenue"
          rows={data?.topRevenue ?? []}
          loading={loading && !data}
          showRevPct
        />
        <ItemTable
          title="Slow Movers"
          icon={<Snowflake className="h-5 w-5 text-blue-400" />}
          description="Candidates to demote, re-merchandise or remove"
          rows={data?.slowMovers ?? []}
          loading={loading && !data}
        />
        <ItemTable
          title="Loss Leaders"
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          description="High volume, low margin — review pricing"
          rows={data?.lossLeaders ?? []}
          loading={loading && !data}
          showFoodCostPct
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Food Cost Alerts
          </CardTitle>
          <CardDescription>
            Items where food cost exceeds 50% of menu price.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.foodCostAlerts?.length ? (
            <div className="space-y-2">
              {data.foodCostAlerts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between border border-border rounded-md p-3"
                >
                  <div>
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Price {fmt$(r.price)} · Cost {r.foodCost != null ? fmt$(r.foodCost) : "—"} · Margin {r.grossMargin != null ? fmt$(r.grossMargin) : "—"}
                    </div>
                  </div>
                  <Badge variant="destructive">{fmtPct(r.foodCostPct)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {data && data.summary.itemsWithFoodCost === 0
                ? "Add food costs to your menu items in Menu Builder to unlock cost alerts."
                : "No items currently exceed the 50% food cost threshold."}
            </p>
          )}
        </CardContent>
      </Card>

      {data && (
        <p className="text-xs text-muted-foreground text-right">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, loading,
}: { label: string; value: string; icon: React.ReactNode; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold text-foreground">{value}</div>}
      </CardContent>
    </Card>
  );
}

function ItemTable({
  title, icon, description, rows, loading, showMix, showRevPct, showFoodCostPct,
}: {
  title: string; icon: React.ReactNode; description: string; rows: Row[]; loading: boolean;
  showMix?: boolean; showRevPct?: boolean; showFoodCostPct?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data in this window.</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span className="truncate pr-2 text-foreground">{r.name}</span>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>{r.qty} sold</span>
                  <span>{fmt$(r.revenue)}</span>
                  {showMix && <Badge variant="secondary">{fmtPct(r.mixPct)}</Badge>}
                  {showRevPct && <Badge variant="secondary">{fmtPct(r.revPct)}</Badge>}
                  {showFoodCostPct && <Badge variant="outline">{fmtPct(r.foodCostPct)}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
