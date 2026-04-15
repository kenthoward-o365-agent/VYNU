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
import { toast } from "sonner";
import { Plug, RefreshCw, AlertTriangle } from "lucide-react";

const posProviders = [
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
}

export default function IntegrationsSettingsTab({ venueId }: { venueId: string }) {
  const { venue, refetch } = useVenue();
  const [menuSource, setMenuSource] = useState<string>("manual");
  const [integration, setIntegration] = useState<PosIntegration | null>(null);
  const [provider, setProvider] = useState("lightspeed");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);

  useEffect(() => {
    if (venue) {
      setMenuSource((venue as any).menu_source || "manual");
    }
    fetchIntegration();
  }, [venue, venueId]);

  const fetchIntegration = async () => {
    const { data } = await supabase
      .from("venue_pos_integrations" as any)
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle();
    if (data) {
      const d = data as any as PosIntegration;
      setIntegration(d);
      setProvider(d.pos_provider);
      setApiKeyRef(d.api_key_ref || "");
      setEndpointUrl(d.endpoint_url || "");
    }
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
    };

    if (integration) {
      const { error } = await supabase
        .from("venue_pos_integrations" as any)
        .update(payload)
        .eq("id", integration.id);
      if (error) toast.error(error.message);
      else toast.success("Integration updated");
    } else {
      const { error } = await supabase
        .from("venue_pos_integrations" as any)
        .insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Integration created");
    }
    await fetchIntegration();
    setSaving(false);
  };

  const syncStatusColor = (status: string) => {
    switch (status) {
      case "syncing": return "default";
      case "error": return "destructive";
      default: return "secondary";
    }
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

            <div className="flex gap-2">
              <Button onClick={saveIntegration} disabled={saving}>
                {saving ? "Saving..." : integration ? "Update Integration" : "Save Integration"}
              </Button>
              <Button variant="outline" disabled>
                <RefreshCw className="h-4 w-4 mr-1" /> Test Connection
              </Button>
            </div>
          </CardContent>
        </Card>
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
    </div>
  );
}
