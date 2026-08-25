import { useEffect, useMemo, useState } from "react";
import { useAuditDate } from "@/contexts/AuditDateContext";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarCheck, ChevronRight, Loader2, Download, DollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import { Badge } from "@/components/ui/badge";
import { functionErrorMessage } from "@/lib/function-errors";
import DayendSettingsCard from "@/components/reporting/DayendSettingsCard";
import AutoClosedOrdersCard from "@/components/reporting/AutoClosedOrdersCard";

interface DayEndLogEntry {
  id: string;
  audit_date: string;
  closed_at: string;
  closed_by: string | null;
  mode: string;
  orders_autoclosed: number;
}

interface GratuityRow {
  id: string;
  audit_date: string | null;
  created_at: string;
  total: number | null;
  gratuity_amount: number | null;
  status: string;
  table_id: string | null;
}

export default function Reporting() {
  const { auditDate, refresh, loading: auditLoading } = useAuditDate();
  const { venue } = useVenue();
  const { toast } = useToast();
  const [log, setLog] = useState<DayEndLogEntry[]>([]);
  const [advancing, setAdvancing] = useState(false);

  // Gratuities report state
  const [reportRange, setReportRange] = useState<DateRange>(() => getDefaultAuditDate(auditDate));
  const [gratuityRows, setGratuityRows] = useState<GratuityRow[]>([]);
  const [tableLabels, setTableLabels] = useState<Record<string, string>>({});
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    if (auditDate) setReportRange(getDefaultAuditDate(auditDate));
  }, [auditDate]);

  useEffect(() => {
    if (!venue) return;
    supabase
      .from("venue_dayend_log")
      .select("id, audit_date, closed_at, closed_by, mode, orders_autoclosed")
      .eq("venue_id", venue.id)
      .order("closed_at", { ascending: false })
      .limit(30)
      .then(({ data }) => { if (data) setLog(data); });
  }, [venue?.id, auditDate]);

  // Fetch gratuities for report range
  useEffect(() => {
    if (!venue) return;
    const fromDate = reportRange.from.toISOString().slice(0, 10);
    const toDate = reportRange.to.toISOString().slice(0, 10);
    setLoadingReport(true);
    supabase
      .from("orders")
      .select("id, audit_date, created_at, total, gratuity_amount, status, table_id")
      .eq("venue_id", venue.id)
      .gte("audit_date", fromDate)
      .lte("audit_date", toDate)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data || []) as GratuityRow[];
        setGratuityRows(rows);
        setLoadingReport(false);

        // Fetch table labels for any tables referenced
        const tableIds = Array.from(new Set(rows.map((r) => r.table_id).filter(Boolean))) as string[];
        if (tableIds.length) {
          supabase
            .from("tables")
            .select("id, table_number")
            .in("id", tableIds)
            .then(({ data: tdata }) => {
              const map: Record<string, string> = {};
              (tdata || []).forEach((t: any) => { map[t.id] = t.table_number; });
              setTableLabels(map);
            });
        }
      });
  }, [venue?.id, reportRange]);

  const summary = useMemo(() => {
    const tipped = gratuityRows.filter((r) => Number(r.gratuity_amount) > 0);
    const totalTips = gratuityRows.reduce((s, r) => s + Number(r.gratuity_amount || 0), 0);
    const totalTaxable = gratuityRows.reduce(
      (s, r) => s + (Number(r.total || 0) - Number(r.gratuity_amount || 0)),
      0
    );
    const avgTip = tipped.length ? totalTips / tipped.length : 0;
    const tipPct = totalTaxable > 0 ? (totalTips / totalTaxable) * 100 : 0;
    return { totalTips, tipCount: tipped.length, avgTip, tipPct, totalTaxable };
  }, [gratuityRows]);

  const handleAdvance = async () => {
    if (!venue) return;
    setAdvancing(true);
    // The dayend-close function applies the venue's open-order gate: with the
    // 'halt' strategy it refuses while open orders exist; with 'autoclose' it
    // sweeps them to Internal Accounting before advancing the day.
    const res = await supabase.functions.invoke("dayend-close", {
      body: { venue_id: venue.id },
    });
    setAdvancing(false);
    const errMsg = await functionErrorMessage(res, "Failed to close the day");
    if (errMsg) {
      toast({ title: "Error", description: errMsg, variant: "destructive" });
      return;
    }
    const result = res.data as {
      halted: boolean; open_orders: number; orders_autoclosed?: number; new_date?: string;
    };
    if (result.halted) {
      toast({
        title: "Close halted — open orders",
        description: `${result.open_orders} open ${result.open_orders === 1 ? "order" : "orders"} must be completed, paid, or cancelled first (see the Orders board). Or switch the strategy to AutoClose below.`,
        variant: "destructive",
      });
      return;
    }
    await refresh();
    toast({
      title: "Day Closed",
      description: `Business day advanced to ${result.new_date}${
        result.orders_autoclosed
          ? ` — ${result.orders_autoclosed} open ${result.orders_autoclosed === 1 ? "order" : "orders"} swept to Internal Accounting`
          : ""
      }`,
    });
  };

  const exportCSV = () => {
    const header = ["Audit Date", "Order ID", "Table", "Time", "Subtotal (ex tip)", "Tip", "Tip %"];
    const lines = gratuityRows.map((r) => {
      const subtotal = Number(r.total || 0) - Number(r.gratuity_amount || 0);
      const tip = Number(r.gratuity_amount || 0);
      const pct = subtotal > 0 ? ((tip / subtotal) * 100).toFixed(2) : "0.00";
      return [
        r.audit_date || "",
        r.id.slice(0, 8),
        r.table_id ? (tableLabels[r.table_id] || r.table_id.slice(0, 8)) : "",
        format(parseISO(r.created_at), "yyyy-MM-dd HH:mm"),
        subtotal.toFixed(2),
        tip.toFixed(2),
        pct,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gratuities_${reportRange.from.toISOString().slice(0,10)}_${reportRange.to.toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (auditLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">DayEnd & Reporting</h2>
        <p className="text-sm text-muted-foreground">{venue?.name}</p>
      </div>

      {/* Current Audit Date */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Current Business Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-foreground">
                {auditDate ? format(parseISO(auditDate), "EEEE, dd MMMM yyyy") : "—"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This is the active trading day. All orders and reports are recorded against this date.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" className="gap-2">
                  Close Day
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close Business Day?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close{" "}
                    <strong>{auditDate ? format(parseISO(auditDate), "dd MMM yyyy") : ""}</strong>{" "}
                    and advance the business day. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAdvance} disabled={advancing}>
                    {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirm Close Day
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Day-End History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Day-End History</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No day-end closings yet. Close your first business day above.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-muted-foreground border-b pb-2">
                <span>Business Day Closed</span>
                <span>Closed At</span>
              </div>
              {log.map((entry) => (
                <div key={entry.id} className="grid grid-cols-2 gap-4 text-sm py-1.5 border-b border-border/50">
                  <span className="text-foreground font-medium flex items-center gap-2">
                    {format(parseISO(entry.audit_date), "dd MMM yyyy")}
                    {entry.mode === "auto" && (
                      <Badge variant="secondary" className="text-xs">Auto</Badge>
                    )}
                    {entry.orders_autoclosed > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {entry.orders_autoclosed} autoclosed
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {format(parseISO(entry.closed_at), "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dayend Close Settings + AutoClosed orders */}
      {venue && (
        <>
          <DayendSettingsCard venueId={venue.id} venueTimezone={venue.timezone} />
          <AutoClosedOrdersCard venueId={venue.id} />
        </>
      )}

      {/* Reports */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-3">Reports</h3>

        {/* Gratuities Report */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Gratuities Report
              </CardTitle>
              <div className="flex items-center gap-2">
                <AuditDatePicker value={reportRange} onChange={setReportRange} auditDateOverride={auditDate} />
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={!gratuityRows.length} className="gap-2">
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Tips</p>
                <p className="text-lg font-bold text-foreground">${summary.totalTips.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Tipped Orders</p>
                <p className="text-lg font-bold text-foreground">{summary.tipCount}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Average Tip</p>
                <p className="text-lg font-bold text-foreground">${summary.avgTip.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Tip % of Sales</p>
                <p className="text-lg font-bold text-foreground">{summary.tipPct.toFixed(1)}%</p>
              </div>
            </div>

            {/* Detail table */}
            {loadingReport ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : gratuityRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No orders found for this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left font-semibold py-2 pr-3">Audit Date</th>
                      <th className="text-left font-semibold py-2 pr-3">Order</th>
                      <th className="text-left font-semibold py-2 pr-3">Table</th>
                      <th className="text-left font-semibold py-2 pr-3">Time</th>
                      <th className="text-right font-semibold py-2 pr-3">Subtotal</th>
                      <th className="text-right font-semibold py-2 pr-3">Tip</th>
                      <th className="text-right font-semibold py-2">Tip %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gratuityRows.map((r) => {
                      const subtotal = Number(r.total || 0) - Number(r.gratuity_amount || 0);
                      const tip = Number(r.gratuity_amount || 0);
                      const pct = subtotal > 0 ? (tip / subtotal) * 100 : 0;
                      return (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 pr-3 text-foreground">
                            {r.audit_date ? format(parseISO(r.audit_date), "dd MMM yyyy") : "—"}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground font-mono text-xs">
                            {r.id.slice(0, 8)}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {r.table_id ? (tableLabels[r.table_id] || "—") : "—"}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {format(parseISO(r.created_at), "HH:mm")}
                          </td>
                          <td className="py-2 pr-3 text-right text-foreground">
                            ${subtotal.toFixed(2)}
                          </td>
                          <td className="py-2 pr-3 text-right text-foreground font-medium">
                            ${tip.toFixed(2)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
