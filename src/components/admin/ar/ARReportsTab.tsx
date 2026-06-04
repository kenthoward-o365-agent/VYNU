import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);

export default function ARReportsTab() {
  const [busy, setBusy] = useState<string | null>(null);

  const download = (name: string, rows: any[]) => {
    if (!rows || rows.length === 0) {
      toast({ title: "No data", description: "Nothing to export." });
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCollections = async () => {
    setBusy("collections");
    const { data } = await supabase
      .from("venue_invoices")
      .select("invoice_number, venue_id, total, currency, status, period_start, period_end, due_date, paid_at, attempt_count")
      .in("status", ["paid", "partially_paid"])
      .order("paid_at", { ascending: false });
    download("collections", data || []);
    setBusy(null);
  };

  const exportFailed = async () => {
    setBusy("failed");
    const { data } = await supabase
      .from("venue_invoices")
      .select("invoice_number, venue_id, total, currency, status, due_date, attempt_count, next_retry_at")
      .in("status", ["failed", "uncollectible"]);
    download("failed_payments", data || []);
    setBusy(null);
  };

  const exportAll = async () => {
    setBusy("all");
    const { data } = await supabase.from("venue_invoices").select("*").order("created_at", { ascending: false });
    download("all_invoices", data || []);
    setBusy(null);
  };

  const reports = [
    { id: "collections", label: "Collections (paid invoices)", desc: "CSV of all paid / partially paid invoices.", run: exportCollections },
    { id: "failed", label: "Failed payments", desc: "CSV of all failed and uncollectible invoices.", run: exportFailed },
    { id: "all", label: "All invoices (raw)", desc: "Complete export of every invoice ever generated.", run: exportAll },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {reports.map(r => (
        <Card key={r.id}>
          <CardContent className="pt-6 space-y-3">
            <div>
              <h3 className="font-semibold text-sm">{r.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
            </div>
            <Button size="sm" variant="outline" onClick={r.run} disabled={busy === r.id}>
              <Download className="h-3.5 w-3.5 mr-2" />
              {busy === r.id ? "Exporting…" : "Download CSV"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
