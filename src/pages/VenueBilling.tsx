import { useEffect, useMemo, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Printer, Download, FileText, Receipt } from "lucide-react";
import { format } from "date-fns";
import VenuePaymentMethodSection from "@/components/venue/VenuePaymentMethodSection";

type Invoice = {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: string;
  paid_at: string | null;
  pdf_url: string | null;
  notes: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  open: "secondary",
  partially_paid: "secondary",
  failed: "destructive",
  uncollectible: "destructive",
  draft: "outline",
  void: "outline",
  manual_pending: "secondary",
};

const fmtMoney = (n: number, cur = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: cur }).format(n || 0);

export default function VenueBilling() {
  const { venue } = useVenue();
  const venueId = venue?.id;
  const venueName = venue?.name ?? "";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    invoice: Invoice;
    lines: any[];
    payments: any[];
    venue: { name: string; address?: string | null; city?: string | null; state?: string | null; postcode?: string | null };
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("venue_invoices")
        .select("*")
        .eq("venue_id", venueId)
        .neq("status", "draft")
        .order("due_date", { ascending: false });
      setInvoices((data as any) || []);
      setLoading(false);
    })();
  }, [venueId]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    (async () => {
      setDetailLoading(true);
      const inv = invoices.find((i) => i.id === openId);
      if (!inv) { setDetailLoading(false); return; }
      const [{ data: lines }, { data: payments }, { data: v }] = await Promise.all([
        supabase.from("venue_invoice_lines").select("*").eq("invoice_id", openId).order("display_order"),
        supabase.from("venue_invoice_payments").select("*").eq("invoice_id", openId).order("attempted_at", { ascending: false }),
        supabase.from("venues").select("name,address,city,state,postcode").eq("id", venueId!).maybeSingle(),
      ]);
      setDetail({ invoice: inv, lines: (lines as any) || [], payments: (payments as any) || [], venue: (v as any) || { name: venueName } });
      setDetailLoading(false);
    })();
  }, [openId, invoices, venueId, venueName]);

  const summary = useMemo(() => {
    let outstanding = 0, paid = 0, overdue = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const i of invoices) {
      if (i.status === "paid") paid += Number(i.total);
      else if (["open", "partially_paid", "failed", "manual_pending"].includes(i.status)) {
        outstanding += Number(i.total);
        if (i.due_date < today) overdue += Number(i.total);
      }
    }
    return { outstanding, paid, overdue };
  }, [invoices]);

  const printInvoice = () => {
    const el = document.getElementById("invoice-print-area");
    if (!el) return;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${detail?.invoice.invoice_number ?? "Invoice"}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;}
        h1{font-size:22px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;color:#555;text-transform:uppercase;letter-spacing:.05em}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:13px}
        th{background:#f8fafc;font-weight:600}
        .right{text-align:right} .muted{color:#666;font-size:12px}
        .totals td{border:none;padding:4px 10px} .totals .grand{font-weight:700;border-top:2px solid #111}
        .meta{display:flex;justify-content:space-between;gap:24px;margin-top:16px}
        .badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef;font-size:11px;text-transform:uppercase}
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  if (!venueId) return <div className="p-6 text-muted-foreground">Select a venue.</div>;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Receipt className="h-6 w-6" /> Billing</h1>
        <p className="text-sm text-muted-foreground">Your invoices, payments and method on file. Everything is real time — nothing is emailed.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Outstanding</CardDescription><CardTitle className="text-2xl">{fmtMoney(summary.outstanding)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Overdue</CardDescription><CardTitle className="text-2xl text-destructive">{fmtMoney(summary.overdue)}</CardTitle></CardHeader></Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices"><FileText className="h-4 w-4 mr-2" />Invoices</TabsTrigger>
          <TabsTrigger value="method">Payment method</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">All invoices</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                        <TableCell className="text-xs">{format(new Date(i.period_start), "d MMM")} – {format(new Date(i.period_end), "d MMM yyyy")}</TableCell>
                        <TableCell className="text-xs">{format(new Date(i.due_date), "d MMM yyyy")}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[i.status] || "outline"}>{i.status.replace("_", " ")}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setOpenId(i.id)}>View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="method" className="mt-4">
          <VenuePaymentMethodSection venueId={venueId} venueName={venueName} />
          <p className="text-xs text-muted-foreground mt-3">
            To swap your payment method, add the new one first — we won't allow the last active method to be removed.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Invoice {detail?.invoice.invoice_number}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={printInvoice} disabled={!detail}>
                  <Printer className="h-4 w-4 mr-2" />Print
                </Button>
                <Button size="sm" variant="outline" onClick={printInvoice} disabled={!detail}>
                  <Download className="h-4 w-4 mr-2" />Save as PDF
                </Button>
                {detail?.invoice.pdf_url && (
                  <a href={detail.invoice.pdf_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">Official PDF</Button>
                  </a>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <Loader2 className="animate-spin h-5 w-5" />
          ) : (
            <div id="invoice-print-area">
              <h1>H&L Pay — Tax Invoice</h1>
              <div className="muted">Invoice {detail.invoice.invoice_number}</div>

              <div className="meta" style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 16 }}>
                <div>
                  <h2>Billed to</h2>
                  <div>{detail.venue.name}</div>
                  {detail.venue.address && <div className="muted">{detail.venue.address}</div>}
                  <div className="muted">
                    {[detail.venue.city, detail.venue.state, detail.venue.postcode].filter(Boolean).join(" ")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <h2>Details</h2>
                  <div>Issued: {format(new Date(detail.invoice.period_end), "d MMM yyyy")}</div>
                  <div>Due: {format(new Date(detail.invoice.due_date), "d MMM yyyy")}</div>
                  <div>Period: {format(new Date(detail.invoice.period_start), "d MMM")} – {format(new Date(detail.invoice.period_end), "d MMM yyyy")}</div>
                  <div style={{ marginTop: 6 }}>
                    <span className="badge">{detail.invoice.status.replace("_", " ")}</span>
                  </div>
                </div>
              </div>

              <h2>Line items</h2>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="right">Qty</th>
                    <th className="right">Unit</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.description}<div className="muted">{l.line_type}</div></td>
                      <td className="right">{Number(l.quantity)}</td>
                      <td className="right">{fmtMoney(Number(l.unit_price), detail.invoice.currency)}</td>
                      <td className="right">{fmtMoney(Number(l.amount), detail.invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="totals" style={{ marginTop: 16, marginLeft: "auto", width: 320 }}>
                <tbody>
                  <tr><td>Subtotal</td><td className="right">{fmtMoney(Number(detail.invoice.subtotal), detail.invoice.currency)}</td></tr>
                  <tr><td>Tax (GST)</td><td className="right">{fmtMoney(Number(detail.invoice.tax), detail.invoice.currency)}</td></tr>
                  <tr className="grand"><td>Total</td><td className="right">{fmtMoney(Number(detail.invoice.total), detail.invoice.currency)}</td></tr>
                </tbody>
              </table>

              {detail.payments.length > 0 && (
                <>
                  <h2>Payments</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>When</th><th>Method</th><th>Status</th><th className="right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((p) => (
                        <tr key={p.id}>
                          <td>{format(new Date(p.attempted_at), "d MMM yyyy HH:mm")}</td>
                          <td>{p.method_type || "—"}</td>
                          <td>{p.status}{p.failure_message ? ` — ${p.failure_message}` : ""}</td>
                          <td className="right">{fmtMoney(Number(p.amount), detail.invoice.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {detail.invoice.notes && (
                <>
                  <h2>Notes</h2>
                  <div className="muted">{detail.invoice.notes}</div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
