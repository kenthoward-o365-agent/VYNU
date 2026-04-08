import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp, Clock, CheckCircle, XCircle } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";

export default function Dashboard() {
  const { venue } = useVenue();
  const [auditDate, setAuditDate] = useState<DateRange>(getDefaultAuditDate);
  const [stats, setStats] = useState({
    revenue: 0,
    orderCount: 0,
    activeOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    avgOrderValue: 0,
  });

  useEffect(() => {
    if (!venue) return;
    const fetchStats = async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total, status, created_at")
        .eq("venue_id", venue.id)
        .gte("created_at", auditDate.from.toISOString())
        .lte("created_at", auditDate.to.toISOString());

      const all = orders || [];
      const revenue = all
        .filter((o) => !["cancelled"].includes(o.status))
        .reduce((s, o) => s + (Number(o.total) || 0), 0);
      const activeOrders = all.filter((o) =>
        ["received", "preparing", "ready"].includes(o.status)
      ).length;
      const completedOrders = all.filter((o) =>
        ["served", "paid"].includes(o.status)
      ).length;
      const cancelledOrders = all.filter((o) => o.status === "cancelled").length;
      const billableOrders = all.filter((o) => o.status !== "cancelled");

      setStats({
        revenue,
        orderCount: all.length,
        activeOrders,
        completedOrders,
        cancelledOrders,
        avgOrderValue: billableOrders.length ? revenue / billableOrders.length : 0,
      });
    };
    fetchStats();
  }, [venue, auditDate]);

  const isToday = auditDate.label === "Today";

  const financialCards = [
    { label: "Revenue", value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: "text-emerald-500" },
    { label: "Avg Order Value", value: `$${stats.avgOrderValue.toFixed(2)}`, icon: TrendingUp, color: "text-indigo-500" },
  ];

  const orderCards = [
    { label: "Total Orders", value: stats.orderCount, icon: ShoppingCart, color: "text-blue-500" },
    ...(isToday
      ? [{ label: "Active Orders", value: stats.activeOrders, icon: Clock, color: "text-amber-500" }]
      : []),
    { label: "Completed", value: stats.completedOrders, icon: CheckCircle, color: "text-emerald-500" },
    { label: "Cancelled", value: stats.cancelledOrders, icon: XCircle, color: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {isToday ? "Today's Performance" : "Performance"}
          </h2>
          <p className="text-muted-foreground">{venue?.name}</p>
        </div>
        <AuditDatePicker value={auditDate} onChange={setAuditDate} />
      </div>

      {/* Financial Performance */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Financial Performance
        </h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {financialCards.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Order Performance */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Order Performance
        </h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {orderCards.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Actions & AI */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Get started by adding menu items, setting up tables, and generating QR codes.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              AI-powered suggestions will appear here once you have order data.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
