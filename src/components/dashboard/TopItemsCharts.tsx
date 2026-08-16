import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/components/AuditDatePicker";

interface Props {
  venueId: string;
  auditDate: DateRange;
}

interface ItemAgg {
  name: string;
  qty: number;
  revenue: number;
}

export default function TopItemsCharts({ venueId, auditDate }: Props) {
  const [items, setItems] = useState<ItemAgg[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("venue_id", venueId)
        .neq("status", "cancelled")
        .gte("created_at", auditDate.from.toISOString())
        .lte("created_at", auditDate.to.toISOString());

      if (!orders?.length) { setItems([]); return; }

      const orderIds = orders.map((o) => o.id);
      const { data: oi } = await supabase
        .from("order_items")
        .select("menu_item_id, quantity, unit_price")
        .in("order_id", orderIds);

      if (!oi?.length) { setItems([]); return; }

      const menuItemIds = [...new Set(oi.map((i) => i.menu_item_id))];
      const { data: mi } = await supabase
        .from("menu_items")
        .select("id, name")
        .in("id", menuItemIds);

      const nameMap = new Map((mi || []).map((m) => [m.id, m.name]));
      const agg = new Map<string, ItemAgg>();
      for (const item of oi) {
        const name = nameMap.get(item.menu_item_id) || "Unknown";
        const existing = agg.get(item.menu_item_id) || { name, qty: 0, revenue: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.quantity * Number(item.unit_price);
        agg.set(item.menu_item_id, existing);
      }
      setItems(Array.from(agg.values()));
    };
    fetch();
  }, [venueId, auditDate]);

  const topByQty = [...items].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topByRev = [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const truncate = (s: string, max = 18) => s.length > max ? s.slice(0, max) + "…" : s;

  if (items.length === 0) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-lg">Top Menu Items</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-8">No item data for this period</p></CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-lg">Top 10 by Qty Sold</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByQty} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => truncate(v)} width={75} />
                <Tooltip formatter={(v: number) => [v, "Qty"]} />
                <Bar dataKey="qty" fill="hsl(256, 90%, 64%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Top 10 by Revenue</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByRev} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => truncate(v)} width={75} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(35, 41%, 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
