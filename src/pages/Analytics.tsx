import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, ShoppingCart, BarChart3 } from "lucide-react";

export default function Analytics() {
  const { venue } = useVenue();
  const [stats, setStats] = useState({
    totalRevenue: 0, orderCount: 0, avgCheck: 0, topItems: [] as { name: string; count: number }[],
  });

  useEffect(() => {
    if (!venue) return;
    const fetch = async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total, status")
        .eq("venue_id", venue.id)
        .in("status", ["served", "paid"]);

      const totalRevenue = (orders || []).reduce((s, o) => s + (Number(o.total) || 0), 0);
      const orderCount = orders?.length || 0;

      setStats({
        totalRevenue,
        orderCount,
        avgCheck: orderCount ? totalRevenue / orderCount : 0,
        topItems: [],
      });
    };
    fetch();
  }, [venue]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Analytics</h2>
        <p className="text-muted-foreground">Performance insights for {venue?.name}</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${stats.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.orderCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Check Size</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${stats.avgCheck.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            AI-powered insights including product mix analysis, loss leader identification,
            food cost alerts, and pricing optimization recommendations will appear here
            once you have sufficient order data. Start adding menu items and receiving orders
            to unlock these features.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
