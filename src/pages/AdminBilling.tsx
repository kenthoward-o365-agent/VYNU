import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, AlertTriangle, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ARInvoicesTab from "@/components/admin/ar/ARInvoicesTab";
import ARVenuesTab from "@/components/admin/ar/ARVenuesTab";
import ARReportsTab from "@/components/admin/ar/ARReportsTab";
import ARSettingsTab from "@/components/admin/ar/ARSettingsTab";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);

export default function AdminBilling() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const from = new Date();
    from.setDate(1);
    const to = new Date();
    const { data: result, error } = await supabase.rpc("get_ar_dashboard", {
      _from: from.toISOString(),
      _to: to.toISOString(),
    });
    if (!error) setData(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const kpis = [
    { label: "Open invoices", value: data?.open_invoices ?? 0, sub: fmt(Number(data?.open_total ?? 0)), icon: Receipt, color: "text-blue-500" },
    { label: "Overdue", value: data?.overdue_invoices ?? 0, sub: fmt(Number(data?.overdue_total ?? 0)), icon: AlertTriangle, color: "text-amber-500" },
    { label: "Failed payments", value: data?.failed_invoices ?? 0, sub: fmt(Number(data?.failed_total ?? 0)), icon: AlertTriangle, color: "text-red-500" },
    { label: "Collected MTD", value: data?.collected_count ?? 0, sub: fmt(Number(data?.collected_period ?? 0)), icon: CheckCircle2, color: "text-green-500" },
    { label: "Due next 7 days", value: data?.upcoming_due_count ?? 0, sub: "", icon: Clock, color: "text-purple-500" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div>
        <h1 className="text-2xl font-bold">H&L Pay — Accounts Receivable</h1>
        <p className="text-sm text-muted-foreground">Recurring billing, invoices, and collections for all venues.</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="venues">Venues & Payment Methods</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {kpis.map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-6">
                  {loading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                        <k.icon className={`h-4 w-4 ${k.color}`} />
                      </div>
                      <p className="text-2xl font-bold mt-1">{k.value}</p>
                      {k.sub && <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Aged receivables (open invoices)
                </h3>
                {loading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-2">
                    {[
                      { l: "0–30 days", v: data?.aging?.["0_30"] ?? 0, c: "bg-green-500" },
                      { l: "31–60 days", v: data?.aging?.["31_60"] ?? 0, c: "bg-amber-500" },
                      { l: "61–90 days", v: data?.aging?.["61_90"] ?? 0, c: "bg-orange-500" },
                      { l: "90+ days", v: data?.aging?.["90_plus"] ?? 0, c: "bg-red-500" },
                    ].map((b) => (
                      <div key={b.l} className="flex items-center gap-3">
                        <span className="w-24 text-xs text-muted-foreground">{b.l}</span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div className={`h-full ${b.c}`} style={{ width: `${Math.min(100, b.v * 10)}%` }} />
                        </div>
                        <span className="w-10 text-right text-sm font-medium">{b.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Recent failures
                </h3>
                {loading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-1.5 text-sm">
                    {(data?.top_failures || []).length === 0 && (
                      <p className="text-muted-foreground text-xs">No failures — system is healthy.</p>
                    )}
                    {(data?.top_failures || []).map((f: any) => (
                      <div key={f.invoice_id} className="flex items-center justify-between border-b pb-1.5">
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{f.venue_name}</p>
                          <p className="text-xs text-muted-foreground">Attempt {f.attempt_count} · due {f.due_date}</p>
                        </div>
                        <span className="text-sm font-mono">{fmt(Number(f.total))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices"><ARInvoicesTab /></TabsContent>
        <TabsContent value="venues"><ARVenuesTab /></TabsContent>
        <TabsContent value="reports"><ARReportsTab /></TabsContent>
        <TabsContent value="settings"><ARSettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
