import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { FinancialsVenueRow } from "@/pages/AdminFinancials";
import { addMonths, format, startOfMonth } from "date-fns";

interface Props { venues: FinancialsVenueRow[]; }

const HORIZON = 24;

export default function DeferredRevenueSchedule({ venues }: Props) {
  const months = useMemo(() => {
    const start = startOfMonth(new Date());
    return Array.from({ length: HORIZON }, (_, i) => addMonths(start, i));
  }, []);

  const schedule = useMemo(() => {
    return months.map((m) => {
      let total = 0;
      for (const v of venues) {
        if (!v.min_monthly_fee || v.is_active === false) continue;
        const end = v.contract_end_date ? new Date(v.contract_end_date) : null;
        if (end && m > end && !v.auto_renew) continue;
        // If contract ended but auto-renews, assume it keeps going.
        total += Number(v.min_monthly_fee);
      }
      return { month: format(m, "MMM yy"), revenue: Math.round(total * 100) / 100 };
    });
  }, [months, venues]);

  const total = schedule.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Deferred Min-Fee Revenue — Next {HORIZON} Months</CardTitle>
          <p className="text-xs text-muted-foreground">
            Projected recurring min monthly fee revenue. Total: ${total.toFixed(2)}
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={schedule} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={(v) => `$${v}`} className="text-xs fill-muted-foreground" />
                <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                <Bar dataKey="revenue" fill="hsl(252, 85%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Monthly Schedule</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Recognised Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell className="text-right">${r.revenue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
