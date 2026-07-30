import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeHttpUrl } from "@/lib/url";
import { useVenue } from "@/contexts/VenueContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plug, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock,
  Cable, Zap, Settings2, ExternalLink,
} from "lucide-react";
import PosConnectDialog from "./PosConnectDialog";
import HLPosPanel from "./HLPosPanel";

interface Provider {
  id: string;
  slug: string;
  name: string;
  auth_type: string;
  status: string;               // ga | beta | deprecated
  is_active: boolean;
  capabilities: Record<string, boolean> | null;
  docs_url: string | null;
}

interface VenueIntegration {
  id: string;
  venue_id: string;
  provider_id: string | null;
  pos_provider: string;
  connection_status: string;    // connected | connecting | error | disconnected
  last_sync_at: string | null;
  last_error: string | null;
  sync_status: string;
}

interface SyncLogEntry {
  id: string;
  event_type: string;
  direction: string;
  result: string;
  error_message: string | null;
  items_synced: number;
  created_at: string;
}

export default function IntegrationsSettingsTab({ venueId }: { venueId: string }) {
  const { venue, refetch } = useVenue();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [integration, setIntegration] = useState<VenueIntegration | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [menuSource, setMenuSource] = useState<string>("manual");
  const [saving, setSaving] = useState(false);
  const [showMenuWarning, setShowMenuWarning] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [connectSlug, setConnectSlug] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const connected = integration?.connection_status === "connected";
  const activeProvider = providers.find((p) => p.slug === integration?.pos_provider) ?? null;

  useEffect(() => {
    void loadAll();
  }, [venueId]);

  useEffect(() => {
    if (venue) setMenuSource((venue as any).menu_source || "manual");
  }, [venue]);

  async function loadAll() {
    setLoading(true);
    const [{ data: provs }, { data: integ }, { data: logs }] = await Promise.all([
      (supabase as any).from("pos_providers")
        .select("id, slug, name, auth_type, status, is_active, capabilities, docs_url")
        .eq("is_active", true)
        .order("name"),
      (supabase as any).from("venue_pos_integrations")
        .select("id, venue_id, provider_id, pos_provider, connection_status, last_sync_at, last_error, sync_status")
        .eq("venue_id", venueId)
        .maybeSingle(),
      supabase.from("pos_sync_log")
        .select("*")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setProviders((provs ?? []) as Provider[]);
    setIntegration((integ ?? null) as VenueIntegration | null);
    setSyncLogs((logs ?? []) as SyncLogEntry[]);
    setLoading(false);
  }

  async function testConnection() {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("pos-test-connection", {
      body: { venue_id: venueId },
    });
    setTesting(false);
    if (error) toast.error(error.message);
    else if ((data as any)?.ok) toast.success((data as any).message || "Connection OK");
    else toast.error((data as any)?.message || "Test failed");
    void loadAll();
  }

  async function disconnect() {
    if (!integration) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("venue_pos_integrations")
      .update({ connection_status: "disconnected", sync_status: "idle" })
      .eq("id", integration.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Provider disconnected");
    setShowDisconnect(false);
    void loadAll();
  }

  const handleMenuToggle = (checked: boolean) => {
    const newSource = checked ? "pos" : "manual";
    if (newSource === "pos" && menuSource === "manual") {
      setPendingSource("pos");
      setShowMenuWarning(true);
    } else {
      void applyMenuSource(newSource);
    }
  };

  async function applyMenuSource(source: string) {
    setSaving(true);
    const { error } = await supabase
      .from("venues")
      .update({ menu_source: source } as any)
      .eq("id", venueId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setMenuSource(source);
    toast.success(`Menu source: ${source === "pos" ? "POS-managed" : "Manual"}`);
    await refetch();
  }

  function statusBadge(s: string) {
    if (s === "connected") return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
    if (s === "connecting") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Connecting</Badge>;
    if (s === "error") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Error</Badge>;
    return <Badge variant="outline">Not connected</Badge>;
  }

  function releaseBadge(s: string) {
    if (s === "ga") return null;
    if (s === "beta") return <Badge variant="secondary" className="text-[10px] uppercase">Beta</Badge>;
    if (s === "coming_soon" || s === "planned") return <Badge variant="outline" className="text-[10px] uppercase">Coming soon</Badge>;
    return <Badge variant="outline" className="text-[10px] uppercase">{s}</Badge>;
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading integrations…</p>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ─── STEP 1: Choose / connect a POS ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="h-5 w-5" /> POS Integrations
          </CardTitle>
          <CardDescription>
            Connect your Point-of-Sale so H&amp;L OrderNOW can push diner orders straight into it.
            You can decide who owns the menu after the connection is live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No POS providers are enabled for your workspace yet. Contact H&amp;L OrderNOW support to enable H&amp;L Exceed.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {providers.map((p) => {
                const isActive = integration?.pos_provider === p.slug;
                const isConnected = isActive && integration?.connection_status === "connected";
                const docsUrl = safeHttpUrl(p.docs_url);
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-4 space-y-3 transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{p.name}</h3>
                          {releaseBadge(p.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.auth_type === "oauth2_client_credentials" ? "OAuth 2.0 (client credentials)" : p.auth_type}
                        </p>
                      </div>
                      {isActive && statusBadge(integration!.connection_status)}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {Object.entries(p.capabilities ?? {}).filter(([, v]) => v).slice(0, 4).map(([k]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">{k.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {isConnected ? (
                        <>
                          <Button size="sm" variant="outline" disabled={testing} onClick={testConnection}>
                            <RefreshCw className={`h-3 w-3 mr-1 ${testing ? "animate-spin" : ""}`} /> Test
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConnectSlug(p.slug)}>
                            <Settings2 className="h-3 w-3 mr-1" /> Reconfigure
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => setShowDisconnect(true)}>
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          disabled={p.status === "coming_soon" || p.status === "planned"}
                          onClick={() => setConnectSlug(p.slug)}
                        >
                          <Plug className="h-3 w-3 mr-1" />
                          {isActive ? "Finish setup" : "Connect"}
                        </Button>
                      )}
                      {docsUrl && (
                        <a href={docsUrl} target="_blank" rel="noreferrer"
                           className="inline-flex items-center gap-1 text-xs text-primary hover:underline self-center">
                          Docs <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {isActive && integration?.last_error && (
                      <p className="text-xs text-destructive truncate" title={integration.last_error}>
                        {integration.last_error}
                      </p>
                    )}
                    {isActive && integration?.last_sync_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Last sync: {new Date(integration.last_sync_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── STEP 2: H&L Exceed detail panel (OAuth token, webhook, etc.) ─ */}
      {connected && activeProvider?.slug === "hl_exceed" && (
        <HLPosPanel venueId={venueId} />
      )}

      {/* ─── STEP 3: Order routing + menu ownership ───────────────────── */}
      <Card className={connected ? "" : "opacity-60"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" /> Order Routing &amp; Menu Ownership
          </CardTitle>
          <CardDescription>
            Once a POS is connected, diner orders are pushed to it automatically. Choose who owns the menu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className={`h-4 w-4 ${connected ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-medium">Push orders to POS</span>
              <span className="ml-auto">
                {connected ? <Badge>Active</Badge> : <Badge variant="outline">Requires connection</Badge>}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Every confirmed diner order is delivered to <strong>{activeProvider?.name ?? "your POS"}</strong> in real time.
              Failed deliveries retry automatically and are logged below.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">POS manages the menu</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {menuSource === "pos"
                  ? "Your POS is the source of truth — items sync from it into H&L OrderNOW."
                  : "Menu is edited in the H&L OrderNOW Menu Builder. Turn on to let the POS drive it instead."}
              </p>
            </div>
            <Switch
              checked={menuSource === "pos"}
              onCheckedChange={handleMenuToggle}
              disabled={saving || !connected}
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Sync log ─────────────────────────────────────────────────── */}
      {syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Recent activity
            </CardTitle>
            <CardDescription>Last 10 events from this venue's POS connection</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{log.event_type}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{log.direction}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {log.result === "success"
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <XCircle className="h-4 w-4 text-destructive" />}
                        <span className="text-xs">{log.result}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{log.items_synced}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Dialogs ───────────────────────────────────────────────────── */}
      <PosConnectDialog
        venueId={venueId}
        open={!!connectSlug}
        onOpenChange={(o) => { if (!o) setConnectSlug(null); }}
        onSaved={() => { setConnectSlug(null); void loadAll(); }}
      />

      <AlertDialog open={showMenuWarning} onOpenChange={setShowMenuWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" /> Let the POS manage the menu?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Existing manual menu items are preserved, but the next POS sync will overwrite them.
              You can switch back to manual at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSource(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowMenuWarning(false);
              if (pendingSource) void applyMenuSource(pendingSource);
              setPendingSource(null);
            }}>
              Switch to POS-managed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDisconnect} onOpenChange={setShowDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect POS?</AlertDialogTitle>
            <AlertDialogDescription>
              Orders will no longer be pushed to your POS until you reconnect. Stored credentials are retained
              in Vault and can be re-enabled without re-entering them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={disconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
