import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DollarSign, Building2, TrendingUp, Receipt, CalendarClock, PiggyBank, Download } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import VenueRevenueTable from "@/components/admin/VenueRevenueTable";
import DeferredRevenueSchedule from "@/components/admin/DeferredRevenueSchedule";
import ContractsOverview from "@/components/admin/ContractsOverview";

export interface FinancialsVenueRow {
  venue_id: string;
  name: string;
  venue_type: string;
  is_active: boolean | null;
  commission_percent: number;
  min_monthly_fee: number;
  billing_currency: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  billing_day_of_month: number;
  estimated_annual_gmv: number;
  auto_renew: boolean;
  renewal_term_months: number;
  net_revenue: number;
  billable_orders: number;
  commission_earned: number;
  min_fee_due: number;
  months_remaining: number | null;
  forecast_annual_commission: number;
  deferred_min_fee_revenue: number;
  total_billable: number;
}

interface FinancialsResponse {
  period: { from: string; to: string; months: number };
  totals: {
    active_venues: number;
    total_venues: number;
    net_revenue: number;
    commission_earned: number;
    min_fee_due: number;
    total_billable: number;
    deferred_revenue: number;
    forecast_annual_commission: number;
    estimated_annual_gmv: number;
  };
  venues: FinancialsVenueRow[];
}

export default function AdminFinancials() {
  const [range, setRange] = useState<DateRange>(getDefaultAuditDate);
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("get_platform_financials", {
        _from: range.from.toISOString(),
        _to: range.to.toISOString(),
      });
      if (cancelled) return;
      if (error) setError(error.message);
      else setData(data as unknown as FinancialsResponse);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  const totals = data?.totals;
  const venues = data?.venues || [];

  const kpis = useMemo(() => [
    { label: "Active Venues", value: totals ? `${totals.active_venues} / ${totals.total_venues}` : "—", icon: Building2, color: "text-primary" },
    { label: "Net Revenue (period)", value: totals ? `$${Number(totals.net_revenue).toFixed(2)}` : "—", icon: DollarSign, color: "text-emerald-500", sub: "ex tax, incl tips" },
    { label: "Commission Earned", value: totals ? `$${Number(totals.commission_earned).toFixed(2)}` : "—", icon: Receipt, color: "text-indigo-500" },
    { label: "Min Fees Due", value: totals ? `$${Number(totals.min_fee_due).toFixed(2)}` : "—", icon: PiggyBank, color: "text-amber-500", sub: `${data?.period.months.toFixed(1)} months` },
    { label: "Total Billable", value: totals ? `$${Number(totals.total_billable).toFixed(2)}` : "—", icon: TrendingUp, color: "text-emerald-500", sub: "commission + min fees" },
    { label: "Deferred Revenue", value: totals ? `$${Number(totals.deferred_revenue).toFixed(2)}` : "—", icon: CalendarClock, color: "text-blue-500", sub: "min fees × months left" },
    { label: "Forecast Annual Commission", value: totals ? `$${Number(totals.forecast_annual_commission).toFixed(2)}` : "—", icon: TrendingUp, color: "text-purple-500", sub: `Est. GMV $${Number(totals?.estimated_annual_gmv || 0).toLocaleString()}` },
  ], [totals, data]);

  const exportCsv = () => {
    if (!venues.length) return;
    const headers = [
      "Venue","Type","Status","Currency","Commission %","Min Monthly Fee","Contract Start","Contract End","Billing Day",
      "Est. Annual GMV","Auto Renew","Net Revenue","Billable Orders","Commission Earned","Min Fees Due","Total Billable",
      "Months Remaining","Deferred Revenue","Forecast Annual Commission",
    ];
    const rows = venues.map((v) => [
      v.name, v.venue_type, v.is_active === false ? "Inactive" : "Active", v.billing_currency,
      v.commission_percent, v.min_monthly_fee, v.contract_start_date ?? "", v.contract_end_date ?? "", v.billing_day_of_month,
      v.estimated_annual_gmv, v.auto_renew ? "Yes" : "No",
      v.net_revenue, v.billable_orders, v.commission_earned, v.min_fee_due, v.total_billable,
      v.months_remaining ?? "", v.deferred_min_fee_revenue, v.forecast_annual_commission,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financials-${range.from.toISOString().slice(0,10)}-to-${range.to.toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Financials</h2>
          <p className="text-sm text-muted-foreground">Subscription revenue, commissions, contracts, and deferred revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!venues.length}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <AuditDatePicker value={range} onChange={setRange} />
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">Financials failed to load: {error}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
              </div>
              <p className="text-lg font-bold text-foreground">{loading ? "..." : k.value}</p>
              {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="venues" className="w-full">
        <TabsList>
          <TabsTrigger value="venues">Venue Revenue</TabsTrigger>
          <TabsTrigger value="deferred">Deferred Revenue Schedule</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>
        <TabsContent value="venues">
          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Per-Venue Revenue & Billing</CardTitle>
              <p className="text-xs text-muted-foreground">Ranked by total billable for the selected period</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <VenueRevenueTable venues={venues} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="deferred">
          <DeferredRevenueSchedule venues={venues} />
        </TabsContent>
        <TabsContent value="contracts">
          <ContractsOverview venues={venues} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
