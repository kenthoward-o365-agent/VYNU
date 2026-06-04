import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);

const STATUS_COLOR: Record<string, string> = {
  draft: "secondary",
  open: "default",
  paid: "default",
  partially_paid: "default",
  failed: "destructive",
  void: "outline",
  uncollectible: "destructive",
  manual_pending: "secondary",
};

export default function ARInvoicesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<any>(null);
  const PAGE = 25;

  const load = async () => {
    setLoading(true);
    const statusArr = statusFilter === "all" ? null : [statusFilter];
    const { data, error } = await supabase.rpc("list_ar_invoices", {
      _status: statusArr,
      _search: search || null,
      _limit: PAGE,
      _offset: page * PAGE,
    });
    if (error) {
      toast({ title: "Failed to load invoices", description: error.message, variant: "destructive" });
    } else {
      setRows(data || []);
      setTotalCount(Number((data as any)?.[0]?.total_count ?? 0));
    }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice # or venue…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="uncollectible">Uncollectible</SelectItem>
            <SelectItem value="void">Void</SelectItem>
            <SelectItem value="manual_pending">Manual pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No invoices found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(r)}>
                    <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                    <TableCell>{r.venue_name}</TableCell>
                    <TableCell className="text-xs">{r.period_start} → {r.period_end}</TableCell>
                    <TableCell>{r.due_date}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(Number(r.total))}</TableCell>
                    <TableCell><Badge variant={STATUS_COLOR[r.status] as any}>{r.status}</Badge></TableCell>
                    <TableCell>{r.attempt_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, totalCount)} of {totalCount}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= totalCount} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>

      <InvoiceDrawer invoice={selected} onClose={() => { setSelected(null); load(); }} />
    </div>
  );
}

function InvoiceDrawer({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const [lines, setLines] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [manualAmount, setManualAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    Promise.all([
      supabase.from("venue_invoice_lines").select("*").eq("invoice_id", invoice.id).order("display_order"),
      supabase.from("venue_invoice_payments").select("*").eq("invoice_id", invoice.id).order("attempted_at", { ascending: false }),
      supabase.from("venue_billing_events").select("*").eq("invoice_id", invoice.id).order("created_at", { ascending: false }).limit(20),
    ]).then(([l, p, e]) => {
      setLines(l.data || []);
      setPayments(p.data || []);
      setEvents(e.data || []);
    });
    setManualAmount(String(invoice.total ?? ""));
  }, [invoice]);

  const markPaid = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("ar-manual-mark-paid", {
      body: { invoice_id: invoice.id, amount: parseFloat(manualAmount) },
    });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Payment recorded" }); onClose(); }
    setBusy(false);
  };

  const voidInvoice = async () => {
    if (!confirm("Void this invoice?")) return;
    setBusy(true);
    const { error } = await supabase.from("venue_invoices").update({
      status: "void", voided_at: new Date().toISOString(),
    }).eq("id", invoice.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Voided" }); onClose(); }
    setBusy(false);
  };

  if (!invoice) return null;
  return (
    <Sheet open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invoice {invoice.invoice_number}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Venue:</span> {invoice.venue_name}</div>
            <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_COLOR[invoice.status] as any}>{invoice.status}</Badge></div>
            <div><span className="text-muted-foreground">Period:</span> {invoice.period_start} → {invoice.period_end}</div>
            <div><span className="text-muted-foreground">Due:</span> {invoice.due_date}</div>
            <div><span className="text-muted-foreground">Total:</span> <strong>{fmt(Number(invoice.total))}</strong></div>
            <div><span className="text-muted-foreground">Attempts:</span> {invoice.attempt_count}</div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Line items</h4>
            <Table>
              <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {lines.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{l.description}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(Number(l.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Payment attempts</h4>
            {payments.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
              <div className="space-y-1 text-xs">
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between border-b pb-1">
                    <span>{new Date(p.attempted_at).toLocaleString()} · {p.method_type}</span>
                    <span><Badge variant={p.status === "succeeded" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge> {fmt(Number(p.amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Audit log</h4>
            <div className="space-y-1 text-xs max-h-40 overflow-y-auto">
              {events.map(e => (
                <div key={e.id} className="border-b pb-1">
                  <span className="font-mono text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  {" "}· {e.event_type}: {e.description}
                </div>
              ))}
            </div>
          </div>

          {invoice.status !== "paid" && invoice.status !== "void" && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-semibold">Manual actions</h4>
              <div className="flex gap-2 items-center">
                <Input type="number" step="0.01" placeholder="Amount" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} className="w-32" />
                <Button size="sm" onClick={markPaid} disabled={busy}>Mark as paid</Button>
                <Button size="sm" variant="outline" onClick={voidInvoice} disabled={busy}>Void</Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
