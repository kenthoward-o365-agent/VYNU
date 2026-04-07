import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Users, UtensilsCrossed, TrendingUp, Clock } from "lucide-react";

export default function Dashboard() {
  const { venue } = useVenue();
  const [stats, setStats] = useState({ orders: 0, revenue: 0, items: 0, tables: 0, activeOrders: 0, avgOrderValue: 0 });

  useEffect(() => {
    if (!venue) return;
    const fetchStats = async () => {
      const [ordersRes, itemsRes, tablesRes] = await Promise.all([
        supabase.from("orders").select("id, total, status").eq("venue_id", venue.id),
        supabase.from("menu_items").select("id").eq("venue_id", venue.id),
        supabase.from("tables").select("id").eq("venue_id", venue.id),
      ]);
      const orders = ordersRes.data || [];
      const revenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const activeOrders = orders.filter((o) => ["received", "preparing", "ready"].includes(o.status)).length;
      setStats({
        orders: orders.length,
        revenue,
        items: itemsRes.data?.length || 0,
        tables: tablesRes.data?.length || 0,
        activeOrders,
        avgOrderValue: orders.length ? revenue / orders.length : 0,
      });
    };
    fetchStats();
  }, [venue]);

  const statCards = [
    { label: "Today's Revenue", value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: "text-emerald-500" },
    { label: "Active Orders", value: stats.activeOrders, icon: Clock, color: "text-amber-500" },
    { label: "Total Orders", value: stats.orders, icon: ShoppingCart, color: "text-blue-500" },
    { label: "Menu Items", value: stats.items, icon: UtensilsCrossed, color: "text-purple-500" },
    { label: "Tables", value: stats.tables, icon: Users, color: "text-pink-500" },
    { label: "Avg Order Value", value: `$${stats.avgOrderValue.toFixed(2)}`, icon: TrendingUp, color: "text-indigo-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-muted-foreground">{venue?.name} — here's what's happening today</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((s) => (
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
              Add menu items and start receiving orders to unlock insights.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
