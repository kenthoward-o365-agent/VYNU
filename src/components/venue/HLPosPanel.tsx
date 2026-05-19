// H&L POS (Exceed) — venue-level integration panel.
//
// Shows: connection status, sync direction toggles, the inbound webhook URL
// the operator must give to H&L POS, last webhook + last menu pull timestamps,
// "Test Connection" + "Sync menu now" actions, and the pending menu change
// approval queue.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, RefreshCw, CheckCircle, XCircle, Webhook, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

interface Props { venueId: string }

interface Integ {
  id: string;
  pos_provider: string;
  location_id: string | null;
  connection_status: string;
  sync_pos_to_us: boolean;
  sync_us_to_pos: boolean;
  last_menu_pull_at: string | null;
  last_webhook_at: string | null;
  last_error: string | null;
  config: Record<string, unknown> | null;
}

interface QueueRow {
  id: string;
  change_kind: string;
  pos_id: string | null;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
  error: string | null;
}

export default function HLPosPanel({ venueId }: Props) {
  const [integ, setInteg] = useState<Integ | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const webhookBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-hl-webhook`;
  const callbackUrl = integ?.location_id ? `${webhookBase}/${integ.location_id}` : `${webhookBase}/{your-location-id}`;

  useEffect(() => { void load(); }, [venueId]);

  async function load() {
    const [{ data: i }, { data: q }] = await Promise.all([
      (supabase as any).from("venue_pos_integrations")
        .select("id, pos_provider, location_id, connection_status, sync_pos_to_us, sync_us_to_pos, last_menu_pull_at, last_webhook_at, last_error, config")
        .eq("venue_id", venueId).maybeSingle(),
      (supabase as any).from("pos_menu_change_queue")
        .select("id, change_kind, pos_id, status, payload, created_at, error")
        .eq("venue_id", venueId).order("created_at", { ascending: false }).limit(25),
    ]);
    setInteg((i as Integ) ?? null);
    setQueue((q as QueueRow[]) ?? []);
  }

  async function toggleDirection(field: "sync_pos_to_us" | "sync_us_to_pos", value: boolean) {
    if (!integ) return;
    const { error } = await (supabase as any).from("venue_pos_integrations")
      .update({ [field]: value }).eq("id", integ.id);
    if (error) return toast.error(error.message);
    setInteg({ ...integ, [field]: value } as Integ);
    toast.success("Sync direction updated");
  }

  async function testConnection() {
    setBusy("test");
    const { data, error } = await supabase.functions.invoke("pos-test-connection", {
      body: { venue_id: venueId },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    if ((data as any)?.ok) toast.success((data as any).message ?? "Connected");
    else toast.error((data as any)?.message ?? "Connection failed");
    void load();
  }

  async function syncMenuNow() {
    setBusy("sync");
    const { data, error } = await supabase.functions.invoke("pos-menu-pull", {
      body: { venue_id: venueId },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const d = data as any;
    if (d?.ok) toast.success(`Synced ${d.items ?? 0} items, ${d.categories ?? 0} categories`);
    else toast.error(d?.error ?? "Sync failed");
    void load();
  }

  async function reviewQueueItem(id: string, status: "approved" | "rejected") {
    const { error } = await (supabase as any).from("pos_menu_change_queue")
      .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Queued for push to POS" : "Rejected");
    void load();
  }

  if (!integ || integ.pos_provider !== "hl_exceed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>H&L POS</CardTitle>
          <CardDescription>Select H&L Exceed in "Connect Provider" above to configure this venue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const statusBadge = (s: string) => {
    const variant = s === "connected" ? "default" : s === "error" ? "destructive" : "secondary";
    return <Badge variant={variant as any}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            H&L POS Integration {statusBadge(integ.connection_status)}
          </CardTitle>
          <CardDescription>
            Live status, sync direction, and the values H&L POS needs to deliver menu events to us.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Last menu pull</Label>
              <p className="text-sm">{integ.last_menu_pull_at ? new Date(integ.last_menu_pull_at).toLocaleString() : "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last webhook received</Label>
              <p className="text-sm">{integ.last_webhook_at ? new Date(integ.last_webhook_at).toLocaleString() : "—"}</p>
            </div>
          </div>

          {integ.last_error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {integ.last_error}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label>POS → H&L OrderNOW</Label>
                  <p className="text-xs text-muted-foreground">Pull menu changes from H&L Menu Management</p>
                </div>
              </div>
              <Switch checked={integ.sync_pos_to_us} onCheckedChange={(v) => toggleDirection("sync_pos_to_us", v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label>H&L OrderNOW → POS</Label>
                  <p className="text-xs text-muted-foreground">Push price/availability updates to linked items (requires approval)</p>
                </div>
              </div>
              <Switch checked={integ.sync_us_to_pos} onCheckedChange={(v) => toggleDirection("sync_us_to_pos", v)} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook URL for H&L POS</Label>
            <div className="flex gap-2">
              <Input readOnly value={callbackUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => {
                navigator.clipboard.writeText(callbackUrl);
                toast.success("Copied");
              }}><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Give this URL to the H&L POS Event Subscriber when creating the subscription. The shared secret you stored under "Connect Provider" is used to verify each inbound event.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap border-t pt-4">
            <Button onClick={testConnection} disabled={busy !== null} variant="outline">
              {busy === "test" ? "Testing…" : <><RefreshCw className="h-4 w-4 mr-1" /> Test Connection</>}
            </Button>
            <Button onClick={syncMenuNow} disabled={busy !== null || !integ.sync_pos_to_us}>
              {busy === "sync" ? "Syncing…" : <><ArrowDownToLine className="h-4 w-4 mr-1" /> Sync menu now</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending menu changes</CardTitle>
          <CardDescription>
            Edits made in H&L OrderNOW that are queued for push to the POS. Approve to release, reject to discard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queued changes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>POS ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="text-xs">{new Date(q.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{q.change_kind}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{q.pos_id ?? "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs">
                        {q.status === "sent" && <CheckCircle className="h-3 w-3 text-green-500" />}
                        {q.status === "failed" && <XCircle className="h-3 w-3 text-destructive" />}
                        {q.status}
                      </span>
                      {q.error && <span className="block text-[10px] text-destructive">{q.error}</span>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {q.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => reviewQueueItem(q.id, "rejected")}>Reject</Button>
                          <Button size="sm" onClick={() => reviewQueueItem(q.id, "approved")}>Approve</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
