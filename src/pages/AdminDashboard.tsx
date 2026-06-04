import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, DollarSign, Receipt, TrendingUp, ShoppingCart, Users } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import PlatformFunnelCard from "@/components/admin/PlatformFunnelCard";
import PlatformKpiStrip from "@/components/admin/PlatformKpiStrip";

interface VenueRow {
  id: string;
  name: string;
  venue_type: string;
  is_active: boolean | null;
}

interface OrderRow {
  id: string;
  venue_id: string;
  total: number | null;
  status: string;
  created_at: string;
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
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [venueRes, orderRes] = await Promise.all([
        supabase.from("venues").select("id, name, venue_type, is_active"),
        supabase
          .from("orders")
          .select("id, venue_id, total, status, created_at")
          .gte("created_at", auditDate.from.toISOString())
          .lte("created_at", auditDate.to.toISOString())
          .order("created_at", { ascending: false }),
      ]);
      if (venueRes.data) setVenues(venueRes.data);
      if (orderRes.data) setOrders(orderRes.data as OrderRow[]);
      setLoading(false);
    };
    fetch();
  }, [auditDate]);

  // KPI calculations
  const activeVenues = venues.filter((v) => v.is_active !== false).length;
  const billableOrders = orders.filter((o) => o.status !== "cancelled");
  const grossRevenue = billableOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgOrderValue = billableOrders.length ? grossRevenue / billableOrders.length : 0;

  // Orders by status
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const statusChartData = Object.entries(statusCounts)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, fill: STATUS_COLORS[name] || "hsl(220, 10%, 50%)" }))
    .filter((d) => d.value > 0);

  // Revenue by venue (top 10)
  const venueMap = new Map(venues.map((v) => [v.id, v.name]));
  const revenueByVenue = new Map<string, number>();
  for (const o of billableOrders) {
    revenueByVenue.set(o.venue_id, (revenueByVenue.get(o.venue_id) || 0) + (Number(o.total) || 0));
  }
  const revenueChartData = Array.from(revenueByVenue.entries())
    .map(([id, rev]) => ({ name: venueMap.get(id) || id.slice(0, 8), revenue: Math.round(rev * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Orders by venue (for count column)
  const ordersByVenue = new Map<string, number>();
  for (const o of orders) {
    ordersByVenue.set(o.venue_id, (ordersByVenue.get(o.venue_id) || 0) + 1);
  }

  // Recent orders (last 20)
  const recentOrders = orders.slice(0, 20);

  const kpis = [
    { label: "Total Venues", value: `${activeVenues} / ${venues.length}`, sub: "active / total", icon: Building2, color: "text-primary" },
    { label: "Total Orders", value: orders.length.toLocaleString(), sub: `${billableOrders.length} billable`, icon: ShoppingCart, color: "text-blue-500" },
    { label: "Gross Revenue", value: `$${grossRevenue.toFixed(2)}`, sub: "excl. cancelled", icon: DollarSign, color: "text-emerald-500" },
    { label: "Avg Order Value", value: `$${avgOrderValue.toFixed(2)}`, sub: `${billableOrders.length} orders`, icon: TrendingUp, color: "text-indigo-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Platform Overview</h2>
          <p className="text-sm text-muted-foreground">Aggregate performance across all venues</p>
        </div>
        <AuditDatePicker value={auditDate} onChange={setAuditDate} />
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0`}>
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



      {/* Charts row */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Revenue by Venue */}
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

        {/* Orders by Status */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Orders by Status</CardTitle>
            <p className="text-xs text-muted-foreground">{orders.length} total orders</p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {orders.length === 0 ? (
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

      {/* Venue Performance Table */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Venue Performance</CardTitle>
          <p className="text-xs text-muted-foreground">Orders and revenue by venue for selected period</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="rounded-md border">
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
                ) : venues
                  .sort((a, b) => (revenueByVenue.get(b.id) || 0) - (revenueByVenue.get(a.id) || 0))
                  .map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{v.venue_type.replace("_", " ")}</TableCell>
                      <TableCell>
                        <Badge variant={v.is_active !== false ? "default" : "secondary"}>
                          {v.is_active !== false ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{ordersByVenue.get(v.id) || 0}</TableCell>
                      <TableCell className="text-right font-medium">${(revenueByVenue.get(v.id) || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
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
                    <TableCell className="font-medium">{venueMap.get(o.venue_id) || "Unknown"}</TableCell>
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
