import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, DollarSign, TrendingUp, ShoppingCart } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import PlatformFunnelCard from "@/components/admin/PlatformFunnelCard";
import PlatformKpiStrip from "@/components/admin/PlatformKpiStrip";

interface DashboardData {
  totals: {
    active_venues: number;
    total_venues: number;
    total_orders: number;
    billable_orders: number;
    gross_revenue: number;
  };
  status_counts: Record<string, number>;
  top_venues: { venue_id: string; name: string; revenue: number }[];
  venues: { id: string; name: string; venue_type: string; is_active: boolean | null; orders_count: number; revenue: number }[];
  recent_orders: { id: string; venue_id: string; venue_name: string | null; total: number | null; status: string; created_at: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  received: "hsl(217, 91%, 60%)",
  preparing: "hsl(45, 93%, 47%)",
  ready: "hsl(280, 70%, 55%)",
  served: "hsl(142, 71%, 45%)",
  paid: "hsl(160, 60%, 45%)",
  cancelled: "hsl(0, 84%, 60%)",
};

export default function AdminDashboard() {
  const [auditDate, setAuditDate] = useState<DateRange>(getDefaultAuditDate);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: rpcData, error } = await supabase.rpc("get_admin_dashboard", {
        _from: auditDate.from.toISOString(),
        _to: auditDate.to.toISOString(),
      });
      if (cancelled) return;
      if (!error && rpcData) setData(rpcData as unknown as DashboardData);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [auditDate]);

  const totals = data?.totals;
  const gross = Number(totals?.gross_revenue || 0);
  const billable = Number(totals?.billable_orders || 0);
  const avgOrderValue = billable ? gross / billable : 0;

  const statusChartData = Object.entries(data?.status_counts || {})
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value: Number(value), fill: STATUS_COLORS[name] || "hsl(220, 10%, 50%)" }))
    .filter((d) => d.value > 0);

  const revenueChartData = (data?.top_venues || []).map((v) => ({
    name: v.name,
    revenue: Math.round(Number(v.revenue) * 100) / 100,
  }));

  const venues = data?.venues || [];
  const recentOrders = data?.recent_orders || [];

  const kpis = [
    { label: "Total Venues", value: totals ? `${totals.active_venues} / ${totals.total_venues}` : "—", sub: "active / total", icon: Building2, color: "text-primary" },
    { label: "Total Orders", value: (totals?.total_orders ?? 0).toLocaleString(), sub: `${billable} billable`, icon: ShoppingCart, color: "text-blue-500" },
    { label: "Gross Revenue", value: `$${gross.toFixed(2)}`, sub: "excl. cancelled", icon: DollarSign, color: "text-emerald-500" },
    { label: "Avg Order Value", value: `$${avgOrderValue.toFixed(2)}`, sub: `${billable} orders`, icon: TrendingUp, color: "text-indigo-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Platform Overview</h2>
          <p className="text-sm text-muted-foreground">Aggregate performance across all venues</p>
        </div>
        <AuditDatePicker value={auditDate} onChange={setAuditDate} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                <p className="text-lg font-bold text-foreground">{loading ? "..." : k.value}</p>
                {k.sub && <p className="text-[10px] text-muted-foreground">{k.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PlatformKpiStrip range={auditDate} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Revenue by Venue</CardTitle>
            <p className="text-xs text-muted-foreground">Top 10 venues by gross revenue</p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {revenueChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No revenue data for this period</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} className="text-xs fill-muted-foreground" />
                    <YAxis type="category" dataKey="name" width={120} className="text-xs fill-muted-foreground" />
                    <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                    <Bar dataKey="revenue" fill="hsl(252, 85%, 60%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Orders by Status</CardTitle>
            <p className="text-xs text-muted-foreground">{totals?.total_orders ?? 0} total orders</p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {statusChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No orders for this period</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {statusChartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
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
      </div>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Venue Performance</CardTitle>
          <p className="text-xs text-muted-foreground">Orders and revenue by venue for selected period</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="rounded-md border max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venues.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No venues found</TableCell></TableRow>
                ) : venues.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{v.venue_type.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={v.is_active !== false ? "default" : "secondary"}>
                        {v.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{v.orders_count}</TableCell>
                    <TableCell className="text-right font-medium">${Number(v.revenue).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <p className="text-xs text-muted-foreground">Latest 20 orders across all venues</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No recent orders</TableCell></TableRow>
                ) : recentOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(o.created_at), "dd MMM HH:mm")}</TableCell>
                    <TableCell className="font-medium">{o.venue_name || "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "paid" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">${(Number(o.total) || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PlatformFunnelCard />
    </div>
  );
}
