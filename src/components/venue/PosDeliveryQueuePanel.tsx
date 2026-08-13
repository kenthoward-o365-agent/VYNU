// HLRDRNW-29: ops view over failed order delivery.
//
// Two lists, because they answer different questions:
//   * Failed deliveries (pos_outbound_dlq) — jobs that exhausted their retries.
//     The payload is preserved, so these can be requeued or written off.
//   * Awaiting delivery — orders still working through the retry/backoff curve.
//     Nothing to do here yet; it exists so staff can tell "retrying" apart from
//     "given up", which a red badge on the Orders page cannot.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, RotateCcw, CheckCircle2, Clock } from "lucide-react";

interface DlqRow {
  id: string;
  kind: string;
  order_id: string | null;
  attempts: number;
  last_error: string | null;
  breaker_state: string | null;
  status: string;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface PendingOrder {
  id: string;
  total: number;
  created_at: string;
  pos_push_status: string | null;
  pos_push_error: string | null;
  pos_push_attempts: number | null;
}

const IN_FLIGHT_STATUSES = ["queued", "sending", "error"];

// pos_outbound_dlq and its RPCs are newer than the generated Supabase types, so
// this screen goes through an untyped client — one suppression rather than a
// cast at every call site. Drop it once types.ts is regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function shortId(id: string | null) {
  return id ? id.slice(0, 8) : "—";
}

function when(ts: string) {
  return new Date(ts).toLocaleString();
}

export default function PosDeliveryQueuePanel({ venueId }: { venueId: string }) {
  const [dlq, setDlq] = useState<DlqRow[]>([]);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [resolveRow, setResolveRow] = useState<DlqRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const dlqQuery = db
      .from("pos_outbound_dlq")
      .select("id, kind, order_id, attempts, last_error, breaker_state, status, resolution_note, resolved_at, created_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(50);

    const [
      { data: dlqRows, error: dlqErr },
      { data: pendingRows, error: pendingErr },
    ] = await Promise.all([
      showResolved ? dlqQuery : dlqQuery.eq("status", "open"),
      db
        .from("orders")
        .select("id, total, created_at, pos_push_status, pos_push_error, pos_push_attempts")
        .eq("venue_id", venueId)
        .in("pos_push_status", IN_FLIGHT_STATUSES)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (dlqErr || pendingErr) {
      toast.error(dlqErr?.message ?? pendingErr?.message ?? "Failed to load POS delivery queue");
      setLoading(false);
      return;
    }

    setDlq((dlqRows ?? []) as DlqRow[]);
    setPending((pendingRows ?? []) as PendingOrder[]);
    setLoading(false);
  }, [venueId, showResolved]);

  useEffect(() => { void load(); }, [load]);

  async function requeue(row: DlqRow) {
    setBusyId(row.id);
    const { error } = await db.rpc("pos_dlq_requeue", { _dlq_id: row.id });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Requeued — the worker will retry within a minute");
    void load();
  }

  async function resolve(row: DlqRow, note: string) {
    setBusyId(row.id);
    const { error } = await db.rpc("pos_dlq_resolve", { _dlq_id: row.id, _note: note });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked as reconciled");
    void load();
  }

  const openCount = dlq.filter((d) => d.status === "open").length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            POS delivery
            {openCount > 0 && (
              <Badge variant="destructive" className="ml-1">{openCount} needs attention</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Orders that failed to reach the POS after every retry. The full job is kept, so it
            can be sent again once the cause is fixed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? "Hide resolved" : "Show resolved"}
            </Button>
          </div>

          {dlq.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              No failed deliveries.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Tries</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dlq.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">{when(row.created_at)}</TableCell>
                      <TableCell className="text-xs">{row.kind}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(row.order_id)}</TableCell>
                      <TableCell className="text-xs">{row.attempts}</TableCell>
                      <TableCell className="text-xs max-w-[24rem] break-words" title={row.last_error ?? ""}>
                        {row.last_error ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "open" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm" variant="outline"
                              disabled={busyId === row.id}
                              onClick={() => void requeue(row)}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Retry
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              disabled={busyId === row.id}
                              onClick={() => setResolveRow(row)}
                            >
                              Reconciled
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {row.status}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Awaiting delivery
            </CardTitle>
            <CardDescription>
              Still retrying with backoff. These need no action unless they stop moving.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tries</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{shortId(o.id)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{when(o.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={o.pos_push_status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                        {o.pos_push_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{o.pos_push_attempts ?? 0}</TableCell>
                    <TableCell className="text-xs max-w-[24rem] break-words">{o.pos_push_error ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!resolveRow} onOpenChange={(o) => { if (!o) setResolveRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as reconciled?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this when the order has been dealt with outside the integration — keyed into
              the POS by hand, or cancelled. It stops the item showing as needing attention and
              does not send anything.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const row = resolveRow;
                setResolveRow(null);
                if (row) void resolve(row, "Reconciled manually by venue staff");
              }}
            >
              Mark reconciled
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
