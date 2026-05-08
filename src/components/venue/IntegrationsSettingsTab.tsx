import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plug, RefreshCw, AlertTriangle, Copy, CheckCircle, XCircle, Clock, Cable } from "lucide-react";
import PosConnectDialog from "./PosConnectDialog";

const posProviders = [
  { value: "hl_exceed", label: "H&L Exceed POS" },
  { value: "lightspeed", label: "Lightspeed" },
  { value: "square", label: "Square" },
  { value: "kounta", label: "Kounta" },
  { value: "doshii", label: "Doshii" },
  { value: "other", label: "Other" },
];

interface PosIntegration {
  id: string;
  venue_id: string;
  pos_provider: string;
  api_key_ref: string | null;
  endpoint_url: string | null;
  last_sync_at: string | null;
  sync_status: string;
  config: any;
  location_id: string | null;
  account_id: string | null;
  webhook_secret: string | null;
  client_id: string | null;
  client_secret_ref: string | null;
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
  const [menuSource, setMenuSource] = useState<string>("manual");
  const [integration, setIntegration] = useState<PosIntegration | null>(null);
  const [provider, setProvider] = useState("hl_exceed");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecretRef, setClientSecretRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-product-sync`;

  useEffect(() => {
    if (venue) {
      setMenuSource((venue as any).menu_source || "manual");
    }
    fetchIntegration();
    fetchSyncLogs();
  }, [venue, venueId]);

  const fetchIntegration = async () => {
    const { data } = await supabase
      .from("venue_pos_integrations")
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle();
    if (data) {
      const d = data as any as PosIntegration;
      setIntegration(d);
      setProvider(d.pos_provider);
      setApiKeyRef(d.api_key_ref || "");
      setEndpointUrl(d.endpoint_url || "");
      setLocationId(d.location_id || "");
      setAccountId(d.account_id || "");
      setClientId(d.client_id || "");
      setClientSecretRef(d.client_secret_ref || "");
    }
  };

  const fetchSyncLogs = async () => {
    const { data } = await supabase
      .from("pos_sync_log")
      .select("*")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setSyncLogs(data as any as SyncLogEntry[]);
  };

  const handleSourceToggle = (checked: boolean) => {
    const newSource = checked ? "pos" : "manual";
    if (newSource === "pos" && menuSource === "manual") {
      setPendingSource("pos");
      setShowWarning(true);
    } else {
      applySourceChange(newSource);
    }
  };

  const applySourceChange = async (source: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("venues")
      .update({ menu_source: source } as any)
      .eq("id", venueId);
    if (error) {
      toast.error(error.message);
    } else {
      setMenuSource(source);
      toast.success(`Menu source set to ${source === "pos" ? "POS" : "Manual"}`);
      await refetch();
    }
    setSaving(false);
  };

  const saveIntegration = async () => {
    setSaving(true);
    const payload: any = {
      venue_id: venueId,
      pos_provider: provider,
      api_key_ref: apiKeyRef || null,
      endpoint_url: endpointUrl || null,
      location_id: locationId || null,
      account_id: accountId || null,
      client_id: clientId || null,
      client_secret_ref: clientSecretRef || null,
    };

    if (integration) {
      const { error } = await supabase
        .from("venue_pos_integrations")
        .update(payload)
        .eq("id", integration.id);
      if (error) toast.error(error.message);
      else toast.success("Integration updated");
    } else {
      const { error } = await supabase
        .from("venue_pos_integrations")
        .insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Integration created");
    }
    await fetchIntegration();
    setSaving(false);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const syncStatusColor = (status: string) => {
    switch (status) {
      case "syncing": return "default";
      case "error": return "destructive";
      default: return "secondary";
    }
  };

  const resultIcon = (result: string) => {
    if (result === "success") return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Menu Source
          </CardTitle>
          <CardDescription>
            Choose whether the menu is managed manually or synced from a POS system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">POS Integration</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {menuSource === "pos"
                  ? "Menu is managed by your POS system"
                  : "Menu is managed manually via the Menu Builder"}
              </p>
            </div>
            <Switch
              checked={menuSource === "pos"}
              onCheckedChange={handleSourceToggle}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      {menuSource === "pos" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>POS Configuration</CardTitle>
              <CardDescription>Configure your POS provider connection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {integration && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge variant={syncStatusColor(integration.sync_status) as any}>
                    {integration.sync_status}
                  </Badge>
                  {integration.last_sync_at && (
                    <span className="text-xs text-muted-foreground">
                      Last sync: {new Date(integration.last_sync_at).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              <div>
                <Label>POS Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {posProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Location ID</Label>
                  <Input
                    className="mt-1"
                    placeholder="H&L OrderNow Location ID"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Account ID</Label>
                  <Input
                    className="mt-1"
                    placeholder="H&L OrderNow Account ID"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>API Key Reference</Label>
                <Input
                  className="mt-1"
                  placeholder="Secret name (e.g. LIGHTSPEED_API_KEY)"
                  value={apiKeyRef}
                  onChange={(e) => setApiKeyRef(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Name of the stored secret — not the actual key
                </p>
              </div>

              <div>
                <Label>Endpoint URL</Label>
                <Input
                  className="mt-1"
                  placeholder="https://api.provider.com/v1"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>OAuth Client ID</Label>
                  <Input
                    className="mt-1"
                    placeholder="M2M client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Client Secret Reference</Label>
                  <Input
                    className="mt-1"
                    placeholder="Secret name (e.g. POS_CLIENT_SECRET)"
                    value={clientSecretRef}
                    onChange={(e) => setClientSecretRef(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Webhook URL (give this to your POS provider)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  POS partners should POST product catalogs to this URL with the <code>x-location-id</code> header
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => setConnectOpen(true)} variant="default">
                  <Cable className="h-4 w-4 mr-1" /> {integration ? "Reconfigure Provider" : "Connect Provider"}
                </Button>
                <Button onClick={saveIntegration} disabled={saving} variant="outline">
                  {saving ? "Saving..." : "Save Legacy Fields"}
                </Button>
                <Button variant="outline" disabled>
                  <RefreshCw className="h-4 w-4 mr-1" /> Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          {syncLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Sync Log
                </CardTitle>
                <CardDescription>Last 10 sync events</CardDescription>
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
                        <TableCell className="text-xs">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{log.event_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {log.direction}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {resultIcon(log.result)}
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
        </>
      )}

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" /> Switch to POS Mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Existing manual menu items will be preserved, but POS sync will overwrite them when it runs.
              You can switch back to manual at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSource(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowWarning(false);
              if (pendingSource) applySourceChange(pendingSource);
              setPendingSource(null);
            }}>
              Switch to POS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PosConnectDialog
        venueId={venueId}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onSaved={() => { void fetchIntegration(); void fetchSyncLogs(); }}
      />
    </div>
  );
}
