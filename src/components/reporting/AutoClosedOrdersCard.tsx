// Orders swept to the Internal Accounting payment type by a dayend close.
// Staff resolve each one: Reopen (back to an active status, payment cleared,
// then settle via the normal Orders flow — correct payment, refund, or comp)
// or Void (cancelled; the internal payment marker stays for the audit trail).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { RotateCcw, Ban, Landmark } from "lucide-react";

interface AutoClosedOrder {
  id: string;
  audit_date: string | null;
  created_at: string;
  total: number | null;
  status: string;
}

export default function AutoClosedOrdersCard({ venueId }: { venueId: string }) {
  const perms = usePermissions();
  const [orders, setOrders] = useState<AutoClosedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, audit_date, created_at, total, status")
      .eq("venue_id", venueId)
      .eq("payment_method", "internal_autoclose")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error("Failed to load autoclosed orders");
    else setOrders((data as AutoClosedOrder[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [venueId]);

  const reopen = async (o: AutoClosedOrder) => {
    setBusy(o.id);
    // Back to an active status with payment cleared — it returns to the Orders
    // board to be settled properly (correct payment, refund, or comp).
    const { error } = await supabase
      .from("orders")
      .update({ status: "served", payment_status: "unpaid", payment_method: null })
      .eq("id", o.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Order reopened — settle it from the Orders board");
    load();
  };

  const voidOrder = async (o: AutoClosedOrder) => {
    if (!confirm("Void this order? It will be cancelled; the Internal Accounting marker stays for the audit trail.")) return;
    setBusy(o.id);
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", payment_status: "void" })
      .eq("id", o.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Order voided");
    load();
  };

  const open = orders.filter((o) => o.status === "paid");
  const resolved = orders.filter((o) => o.status !== "paid");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          AutoClosed Orders (Internal Accounting)
          {open.length > 0 && <Badge variant="destructive">{open.length} to resolve</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Orders still open when a day closed with the AutoClose strategy.
          Reopen to settle them to the correct payment, or void them.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nothing here — no orders have been swept by a dayend close.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {[...open, ...resolved].map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs text-muted-foreground">#{o.id.slice(0, 8)}</code>
                    <span className="text-sm font-medium text-foreground">
                      ${Number(o.total ?? 0).toFixed(2)}
                    </span>
                    {o.status === "paid" ? (
                      <Badge variant="secondary" className="text-xs">Internal Accounting</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Voided</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.audit_date
                      ? `Business day ${format(parseISO(o.audit_date), "dd MMM yyyy")}`
                      : format(parseISO(o.created_at), "dd MMM yyyy")}
                  </p>
                </div>
                {o.status === "paid" && (
                  <>
                    {perms.canReopenClosedOrders && (
                      <Button
                        variant="outline" size="sm" disabled={busy === o.id}
                        onClick={() => reopen(o)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reopen
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm" disabled={busy === o.id}
                      onClick={() => voidOrder(o)}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                      Void
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {open.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Reopened orders return to the <Link to="/orders" className="underline">Orders board</Link>{" "}
            for settlement — take the correct payment, refund, or comp there.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
