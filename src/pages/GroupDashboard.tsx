import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, DollarSign, ShoppingCart, TrendingUp } from "lucide-react";

export default function GroupDashboard() {
  const { group, venues, isGroupAdmin } = useVenue();
  const groupVenues = venues.filter((v) => v.group_id === group?.id);
  const [stats, setStats] = useState<Record<string, { orders: number; revenue: number }>>({});

  useEffect(() => {
    if (!group || groupVenues.length === 0) return;
    const fetchAll = async () => {
      const results: Record<string, { orders: number; revenue: number }> = {};
      for (const v of groupVenues) {
        const { data } = await supabase.from("orders").select("id, total").eq("venue_id", v.id);
        const orders = data || [];
        results[v.id] = {
          orders: orders.length,
          revenue: orders.reduce((s, o) => s + (Number(o.total) || 0), 0),
        };
      }
      setStats(results);
    };
    fetchAll();
  }, [group, venues]);

  const totalRevenue = Object.values(stats).reduce((s, v) => s + v.revenue, 0);
  const totalOrders = Object.values(stats).reduce((s, v) => s + v.orders, 0);

  if (!group) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">No group selected. Assign your venue to a group to use group features.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{group.name}</h2>
        <p className="text-muted-foreground">Group dashboard — {groupVenues.length} venue{groupVenues.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Venues</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{groupVenues.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">${totalRevenue.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{totalOrders}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg / Venue</CardTitle>
            <TrendingUp className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ${groupVenues.length ? (totalRevenue / groupVenues.length).toFixed(2) : "0.00"}
            </div>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-lg font-semibold text-foreground">Venue Breakdown</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupVenues.map((v) => {
          const s = stats[v.id] || { orders: 0, revenue: 0 };
          return (
            <Card key={v.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{v.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{v.city}, {v.state}</p>
              </CardHeader>
              <CardContent className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.orders} orders</span>
                <span className="font-medium text-foreground">${s.revenue.toFixed(2)}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
