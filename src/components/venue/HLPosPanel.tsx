// H&L Exceed Web Orders configuration panel.
// Renders config_schema for hl_exceed, lets a manager save secrets via
// admin-set-pos-credentials, run testConnection, and send a sandbox test order.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHttpUrl } from "@/lib/url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Send, Plug, RefreshCw } from "lucide-react";

interface Field {
  key: string;
  label: string;
  type: "text" | "url" | "number" | "boolean" | "secret";
  required?: boolean;
  help?: string;
  default?: unknown;
  placeholder?: string;
}

interface Props {
  venueId: string;
}

export default function HLPosPanel({ venueId }: Props) {
  const [schema, setSchema] = useState<Field[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [secretsSet, setSecretsSet] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [autoPush, setAutoPush] = useState<boolean>(false);
  const [savingAutoPush, setSavingAutoPush] = useState(false);

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [venueId]);

  async function load() {
    setLoading(true);
    // Secret values (secrets_map) are no longer readable via the Data API.
    // Use SECURITY DEFINER RPC which returns metadata + a list of configured secret keys.
    const [{ data: provider }, { data: integ }] = await Promise.all([
      (supabase as any).from("pos_providers").select("config_schema").eq("slug", "hl_exceed").maybeSingle(),
      (supabase as any).rpc("get_venue_pos_integration_meta", { _venue_id: venueId }),
    ]);
    const fields = (provider?.config_schema ?? []) as Field[];
    setSchema(fields);
    const integObj = (integ ?? null) as any;
    const cfg: Record<string, unknown> = { ...(integObj?.config ?? {}) };
    for (const f of fields) if (cfg[f.key] === undefined && f.default !== undefined) cfg[f.key] = f.default;
    setConfig(cfg);
    const secretKeys: string[] = Array.isArray(integObj?.secrets_keys) ? integObj.secrets_keys : [];
    setSecretsSet(Object.fromEntries(secretKeys.map((k: string) => [k, true])));
    setStatus(integObj?.connection_status ?? "disconnected");
    setAutoPush(Boolean(integObj?.auto_push_orders));
    setLoading(false);
  }


  async function toggleAutoPush(next: boolean) {
    setSavingAutoPush(true);
    setAutoPush(next);
    const { error } = await (supabase as any).from("venue_pos_integrations")
      .update({ auto_push_orders: next }).eq("venue_id", venueId);
    setSavingAutoPush(false);
    if (error) { toast.error(error.message); setAutoPush(!next); return; }
    toast.success(next ? "Auto-push enabled" : "Auto-push disabled");
  }


  function setField(key: string, value: unknown) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    // 1. Ensure a venue_pos_integrations row exists, write non-secret config.
    // url-typed fields are normalised here too (same rule as PosConnectDialog): a
    // scheme-less host would otherwise persist and fail later as "Invalid URL".
    const cleanConfig: Record<string, unknown> = {};
    for (const f of schema) {
      if (f.type === "secret") continue;
      const raw = config[f.key];
      if (f.type === "url" && raw !== undefined && raw !== null) {
        const url = typeof raw === "string" ? normalizeHttpUrl(raw) : null;
        if (url === null) { toast.error(`${f.label} must be a valid http(s) URL`); setSaving(false); return; }
        cleanConfig[f.key] = url;
        continue;
      }
      cleanConfig[f.key] = raw;
    }

    const { data: prov } = await (supabase as any).from("pos_providers")
      .select("id").eq("slug", "hl_exceed").maybeSingle();

    const { error: upErr } = await (supabase as any).from("venue_pos_integrations")
      .upsert({
        venue_id: venueId,
        pos_provider: "hl_exceed",
        provider_id: prov?.id,
        config: cleanConfig,
        // See PosConnectDialog: a bearer cached under the previous credentials would
        // survive for ~24h and make the next test connection a no-op.
        token_cache: null,
      }, { onConflict: "venue_id" });
    if (upErr) { toast.error(upErr.message); setSaving(false); return; }

    // 2. Push any newly-entered secrets via the admin-set-pos-credentials function
    const newSecrets = Object.entries(secrets).filter(([, v]) => v && v.length > 0);
    for (const [field, value] of newSecrets) {
      const { error } = await supabase.functions.invoke("admin-set-pos-credentials", {
        body: { venue_id: venueId, field, value },
      });
      if (error) { toast.error(`Secret ${field}: ${error.message}`); setSaving(false); return; }
    }
    setSecrets({});
    setSaving(false);
    toast.success("Saved");
    void load();
  }

  async function test() {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("pos-test-connection", { body: { venue_id: venueId } });
    setTesting(false);
    if (error) toast.error(error.message);
    else if ((data as any)?.ok) toast.success((data as any).message ?? "Connected");
    else toast.error((data as any)?.message ?? "Test failed");
    void load();
  }

  async function sendTestOrder() {
    setSendingOrder(true);
    setLastResult(null);
    const { data, error } = await supabase.functions.invoke("pos-hl-test-order", { body: { venue_id: venueId } });
    setSendingOrder(false);
    if (error) { toast.error(error.message); return; }
    setLastResult(data);
    if ((data as any)?.ok) toast.success("Test order sent");
    else toast.error((data as any)?.error ?? "Test order failed");
  }

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                H&L Exceed — Web Orders
                <Badge variant={status === "connected" ? "default" : status === "error" ? "destructive" : "outline"}>
                  {status}
                </Badge>
              </CardTitle>
              <CardDescription>
                Configure OAuth + per-venue identifiers issued by H&L. Spec:{" "}
                <a className="underline" href="https://developer.hlpos.com/reference/addorder" target="_blank" rel="noreferrer">addorder</a>
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plug className="h-3 w-3 mr-1" />}
                Test connection
              </Button>
              <Button variant="outline" size="sm" onClick={sendTestOrder} disabled={sendingOrder}>
                {sendingOrder ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Send test order
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {schema.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                {f.type === "boolean" ? (
                  <div className="flex items-center gap-2 h-10">
                    <Switch
                      id={f.key}
                      checked={Boolean(config[f.key])}
                      onCheckedChange={(v) => setField(f.key, v)}
                    />
                    <span className="text-sm text-muted-foreground">{config[f.key] ? "On" : "Off"}</span>
                  </div>
                ) : f.type === "secret" ? (
                  <Input
                    id={f.key}
                    type="password"
                    placeholder={secretsSet[f.key] ? "•••••• (set — enter to replace)" : "Enter value"}
                    value={secrets[f.key] ?? ""}
                    onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={f.key}
                    type={f.type === "number" ? "number" : "text"}
                    placeholder={f.placeholder}
                    value={String(config[f.key] ?? "")}
                    onChange={(e) => setField(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                  />
                )}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Save configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-push orders to POS</CardTitle>
          <CardDescription>
            When enabled, every new order at this venue is automatically queued
            to be sent to H&amp;L. Disable to keep orders in the in-app feed only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-push">Auto-push enabled</Label>
              <p className="text-xs text-muted-foreground">
                Requires a connected H&amp;L integration. Status: <span className="font-medium">{status}</span>
              </p>
            </div>
            <Switch
              id="auto-push"
              checked={autoPush}
              disabled={savingAutoPush || status !== "connected"}
              onCheckedChange={toggleAutoPush}
            />
          </div>
        </CardContent>
      </Card>



      {lastResult !== null && (
        <Card>
          <CardHeader><CardTitle>Last test order</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[400px]">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
