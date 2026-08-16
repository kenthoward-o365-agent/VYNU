import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  orders: { total: number | null; created_at: string; status: string }[];
}

export default function RevenueByHourChart({ orders }: Props) {
  const billable = orders.filter((o) => o.status !== "cancelled");

  const hourMap = new Map<number, number>();
  for (const o of billable) {
    const h = new Date(o.created_at).getHours();
    hourMap.set(h, (hourMap.get(h) || 0) + (Number(o.total) || 0));
  }

  const data = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, "0")}:00`,
    revenue: Math.round((hourMap.get(i) || 0) * 100) / 100,
  })).filter((d) => d.revenue > 0);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Revenue by Hour</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-8">No revenue data for this period</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Revenue by Hour</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="hour" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="hsl(256, 90%, 64%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
