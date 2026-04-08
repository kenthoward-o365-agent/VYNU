import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp, Clock, CheckCircle, XCircle, Receipt, Percent } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import { calculateTaxes, type TaxConfig } from "@/lib/tax-utils";

export default function Dashboard() {
  const { venue } = useVenue();
  const [auditDate, setAuditDate] = useState<DateRange>(getDefaultAuditDate);
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);
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

  // Fetch venue taxes once
  useEffect(() => {
    if (!venue) return;
    supabase
      .from("venue_taxes")
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        if (data) setTaxes(data as TaxConfig[]);
      });
  }, [venue]);

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
      const billable = all.filter((o) => o.status !== "cancelled");
      const grossRevenue = billable.reduce((s, o) => s + (Number(o.total) || 0), 0);

      // Calculate tax breakdown from gross revenue
      const { subtotalExTax, totalTax, lines } = calculateTaxes(grossRevenue, taxes);

      // Aggregate tax lines by name
      const taxMap = new Map<string, { name: string; amount: number; is_inclusive: boolean }>();
      for (const l of lines) {
        const existing = taxMap.get(l.name);
        if (existing) {
          existing.amount += l.amount;
        } else {
          taxMap.set(l.name, { name: l.name, amount: l.amount, is_inclusive: l.is_inclusive });
        }
      }

      const activeOrders = all.filter((o) =>
        ["received", "preparing", "ready"].includes(o.status)
      ).length;
      const completedOrders = all.filter((o) =>
        ["served", "paid"].includes(o.status)
      ).length;
      const cancelledOrders = all.filter((o) => o.status === "cancelled").length;

      setStats({
        grossRevenue,
        netRevenue: subtotalExTax,
        totalTax,
        taxLines: Array.from(taxMap.values()),
        orderCount: all.length,
        activeOrders,
        completedOrders,
        cancelledOrders,
        avgOrderValue: billable.length ? grossRevenue / billable.length : 0,
      });
    };
    fetchStats();
  }, [venue, auditDate, taxes]);

  const isToday = auditDate.label === "Today";
  const hasInclusiveTax = taxes.some((t) => t.is_inclusive);

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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Gross Revenue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Gross Revenue {hasInclusiveTax ? "(incl. tax)" : ""}
              </CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">${stats.grossRevenue.toFixed(2)}</div>
            </CardContent>
          </Card>

          {/* Net Revenue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Revenue</CardTitle>
              <Receipt className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">${stats.netRevenue.toFixed(2)}</div>
            </CardContent>
          </Card>

          {/* Tax breakdown */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tax Collected
              </CardTitle>
              <Percent className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">${stats.totalTax.toFixed(2)}</div>
              {stats.taxLines.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {stats.taxLines.map((tl) => (
                    <p key={tl.name} className="text-xs text-muted-foreground">
                      {tl.name}{tl.is_inclusive ? " (incl.)" : ""}: ${tl.amount.toFixed(2)}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Avg Order Value */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Order Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">${stats.avgOrderValue.toFixed(2)}</div>
            </CardContent>
          </Card>
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
