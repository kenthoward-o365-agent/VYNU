import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Receipt, Percent } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
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

  const ORDER_COLORS = ["hsl(217, 91%, 60%)", "hsl(45, 93%, 47%)", "hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)"];

  const orderChartData = [
    ...(isToday ? [{ name: "Active", value: stats.activeOrders }] : []),
    { name: "Completed", value: stats.completedOrders },
    { name: "Cancelled", value: stats.cancelledOrders },
  ].filter((d) => d.value > 0);

  // Financial Performance section unchanged...

      {/* Order Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Performance</CardTitle>
          <p className="text-sm text-muted-foreground">
            {stats.orderCount} total orders
          </p>
        </CardHeader>
        <CardContent>
          {stats.orderCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No orders for this period
            </p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {orderChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={ORDER_COLORS[index % ORDER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

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
