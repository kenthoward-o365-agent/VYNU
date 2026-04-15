import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { useAuditDate } from "@/contexts/AuditDateContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Receipt, Percent } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { calculateTaxes, type TaxConfig } from "@/lib/tax-utils";
import RevenueByHourChart from "@/components/dashboard/RevenueByHourChart";
import TopItemsCharts from "@/components/dashboard/TopItemsCharts";
import TableUtilization from "@/components/dashboard/TableUtilization";
import TicketTimesCard from "@/components/dashboard/TicketTimesCard";

export default function Dashboard() {
  const { venue } = useVenue();
  const { auditDate: venueAuditDate } = useAuditDate();
  const [auditDate, setAuditDate] = useState<DateRange>(() => getDefaultAuditDate(venueAuditDate));
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);
  const [orders, setOrders] = useState<{ id: string; total: number | null; status: string; created_at: string }[]>([]);
  const [stats, setStats] = useState({
    grossRevenue: 0,
    netRevenue: 0,
    totalTax: 0,
    taxLines: [] as { name: string; amount: number; is_inclusive: boolean }[],
    orderCount: 0,
    activeOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    avgOrderValue: 0,
  });

  // When venue audit date loads, reset the date picker to use it
  useEffect(() => {
    if (venueAuditDate) {
      setAuditDate(getDefaultAuditDate(venueAuditDate));
    }
  }, [venueAuditDate]);

  useEffect(() => {
    if (!venue) return;
    supabase
      .from("venue_taxes")
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => { if (data) setTaxes(data as TaxConfig[]); });
  }, [venue]);

  useEffect(() => {
    if (!venue) return;
    const fetchStats = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, total, status, created_at")
        .eq("venue_id", venue.id)
        .gte("created_at", auditDate.from.toISOString())
        .lte("created_at", auditDate.to.toISOString());

      const all = data || [];
      setOrders(all);
      const billable = all.filter((o) => o.status !== "cancelled");
      const grossRevenue = billable.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const { subtotalExTax, totalTax, lines } = calculateTaxes(grossRevenue, taxes);

      const taxMap = new Map<string, { name: string; amount: number; is_inclusive: boolean }>();
      for (const l of lines) {
        const existing = taxMap.get(l.name);
        if (existing) existing.amount += l.amount;
        else taxMap.set(l.name, { name: l.name, amount: l.amount, is_inclusive: l.is_inclusive });
      }

      const activeOrders = all.filter((o) => ["received", "preparing", "ready"].includes(o.status)).length;
      const completedOrders = all.filter((o) => ["served", "paid"].includes(o.status)).length;
      const cancelledOrders = all.filter((o) => o.status === "cancelled").length;

      setStats({
        grossRevenue, netRevenue: subtotalExTax, totalTax,
        taxLines: Array.from(taxMap.values()),
        orderCount: all.length, activeOrders, completedOrders, cancelledOrders,
        avgOrderValue: billable.length ? grossRevenue / billable.length : 0,
      });
    };
    fetchStats();
  }, [venue, auditDate, taxes]);

  const isToday = auditDate.label === "Today";
  const hasInclusiveTax = taxes.some((t) => t.is_inclusive);
  const ORDER_COLORS = ["hsl(217, 91%, 60%)", "hsl(45, 93%, 47%)", "hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)"];
  const orderChartData = [
    ...(isToday ? [{ name: "Active", value: stats.activeOrders }] : []),
    { name: "Completed", value: stats.completedOrders },
    { name: "Cancelled", value: stats.cancelledOrders },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {isToday ? "Today's Performance" : "Performance"}
          </h2>
          <p className="text-sm text-muted-foreground">{venue?.name}</p>
        </div>
        <AuditDatePicker value={auditDate} onChange={setAuditDate} />
      </div>

      {/* Financial KPIs - compact row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Gross Revenue {hasInclusiveTax ? "(incl.)" : ""}</p>
              <p className="text-lg font-bold text-foreground">${stats.grossRevenue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Receipt className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Net Revenue</p>
              <p className="text-lg font-bold text-foreground">${stats.netRevenue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Percent className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Tax Collected</p>
              <p className="text-lg font-bold text-foreground">${stats.totalTax.toFixed(2)}</p>
              {stats.taxLines.length > 0 && (
                <div className="space-y-0">
                  {stats.taxLines.map((tl) => (
                    <p key={tl.name} className="text-[10px] text-muted-foreground leading-tight">
                      {tl.name}{tl.is_inclusive ? " (incl.)" : ""}: ${tl.amount.toFixed(2)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Avg Order Value</p>
              <p className="text-lg font-bold text-foreground">${stats.avgOrderValue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Hour */}
      <RevenueByHourChart orders={orders} />

      {/* Order Performance + Table Utilization + Ticket Times */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Order Performance</CardTitle>
            <p className="text-xs text-muted-foreground">{stats.orderCount} total orders</p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {stats.orderCount === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No orders for this period</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={orderChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {orderChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={ORDER_COLORS[index % ORDER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {venue && <TableUtilization venueId={venue.id} show={isToday} />}
          {venue && <TicketTimesCard venueId={venue.id} auditDate={auditDate} />}
        </div>
      </div>

      {/* Top 10 Menu Items */}
      <div className="grid gap-3 lg:grid-cols-2">
        {venue && <TopItemsCharts venueId={venue.id} auditDate={auditDate} />}
      </div>
    </div>
  );
}
