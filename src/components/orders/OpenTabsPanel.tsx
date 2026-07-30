import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, RefreshCw } from "lucide-react";
import { money, TAB_PAYMENT_METHOD_LABELS, type TabPaymentMethod, type TabSummary } from "@/lib/tabs";

interface OpenTabRow {
  tab_id: string;
  table_number: string | null;
  zone: string | null;
  status: string;
  label: string | null;
  preauth_status: string;
  opened_at: string;
  total_ordered: number;
  total_paid: number;
  balance_due: number;
}

export default function OpenTabsPanel({ venueId }: { venueId: string }) {
  const [rows, setRows] = useState<OpenTabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<TabSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<TabPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("list_open_tabs", { _venue_id: venueId });
    if (error) console.error("list_open_tabs failed", error);
    setRows((data as OpenTabRow[]) || []);
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const openTab = async (tabId: string) => {
    const { data } = await (supabase as any).rpc("get_tab_summary", { _tab_id: tabId });
    const s = data as TabSummary;
    setActive(s);
    setAmount((s?.balance_due ?? 0).toFixed(2));
    setReference("");
    setMethod("cash");
  };

  const refreshActive = async (tabId: string) => {
    const { data } = await (supabase as any).rpc("get_tab_summary", { _tab_id: tabId });
    setActive(data as TabSummary);
    await load();
  };

  const takePayment = async () => {
    if (!active) return;
    const amt = Number(amount) || 0;
    if (amt <= 0) return toast.error("Enter an amount");
    setBusy(true);
    const { error } = await supabase.from("tab_payments").insert({
      tab_id: active.tab.id,
      venue_id: venueId,
      method,
      amount: amt,
      status: "paid",
      reference_label: reference || null,
      payer_label: "Staff",
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${money(amt)} recorded`);
    await refreshActive(active.tab.id);
  };

  const confirmPending = async (paymentId: string) => {
    if (!active) return;
    const { error } = await supabase
      .from("tab_payments")
      .update({ status: "paid" } as any)
      .eq("id", paymentId);
    if (error) return toast.error(error.message);
    await refreshActive(active.tab.id);
  };

  const settle = async () => {
    if (!active) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("settle_tab", { _tab_id: active.tab.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.settled) {
      toast.success("Tab settled");
      setActive(null);
      await load();
    } else {
      toast.error(`Balance still owing: ${money((data as any)?.balance_due)}`);
    }
  };

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Open tabs ({rows.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.tab_id}
              onClick={() => openTab(r.tab_id)}
              className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:border-primary/50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">
                  Table {r.table_number || "—"}
                  {r.zone ? <span className="text-muted-foreground"> · {r.zone}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Opened {new Date(r.opened_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {r.preauth_status === "authorised" ? " · pre-auth held" : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{money(r.balance_due)}</p>
                {r.status === "closing" && (
                  <Badge variant="destructive" className="text-[10px]">Close requested</Badge>
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tab details</DialogTitle>
            <DialogDescription>
              Take payment, confirm gift cards and close the tab.
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ordered</span>
                  <span>{money(active.total_ordered)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span>{money(active.total_paid)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance</span>
                  <span>{money(active.balance_due)}</span>
                </div>
              </div>

              {active.payments.length > 0 && (
                <div className="space-y-1">
                  {active.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {TAB_PAYMENT_METHOD_LABELS[p.method] || p.method}
                        {p.reference_label ? ` · ${p.reference_label}` : ""} — {p.status}
                      </span>
                      <span className="flex items-center gap-2">
                        {money(p.amount)}
                        {p.status === "pending" && (
                          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => confirmPending(p.id)}>
                            Confirm
                          </Button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TAB_PAYMENT_METHOD_LABELS) as TabPaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>{TAB_PAYMENT_METHOD_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Reference (optional)</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Gift card / terminal ref" />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={busy} onClick={takePayment}>
                  Record payment
                </Button>
                <Button className="flex-1" disabled={busy || active.balance_due > 0.009} onClick={settle}>
                  Close tab
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
