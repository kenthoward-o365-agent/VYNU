import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeHttpUrl } from "@/lib/url";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plug, KeyRound, CheckCircle2 } from "lucide-react";

interface SchemaField {
  key: string;
  label: string;
  type: "text" | "secret" | "number" | "url" | "boolean";
  required?: boolean;
  placeholder?: string;
  help?: string;
}

type FieldValue = string | number | boolean;

// `url`-typed fields render as plain text inputs, so a scheme-less value like
// "handl-sandbox.au.auth0.com/oauth/token" saves happily and only fails much later
// inside fetch() as "Invalid URL". Add the scheme, then keep the value only if it
// parses as http(s) — safeHttpUrl also rejects javascript:/data: schemes.
function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return safeHttpUrl(withScheme) ?? null;
}

interface Provider {
  id: string;
  slug: string;
  name: string;
  auth_type: string;
  status: string;
  capabilities: Record<string, boolean>;
  config_schema: SchemaField[];
}

interface Props {
  venueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function PosConnectDialog({ venueId, open, onOpenChange, onSaved }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const provider = providers.find((p) => p.id === providerId) ?? null;
  const schema: SchemaField[] = provider?.config_schema ?? [];

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, venueId]);

  async function load() {
    setLoading(true);
    const [{ data: provs }, { data: existing }] = await Promise.all([
      (supabase as any).from("pos_providers").select("*").eq("is_active", true)
        .order("is_default", { ascending: false }).order("display_order").order("name"),
      (supabase as any).from("venue_pos_integrations").select("provider_id, config").eq("venue_id", venueId).maybeSingle(),
    ]);
    const list = (provs ?? []) as Provider[];
    setProviders(list);
    if (existing?.provider_id) {
      setProviderId(existing.provider_id);
      setValues((existing.config ?? {}) as Record<string, FieldValue>);
    } else if (list.length > 0) {
      setProviderId(list[0].id);
      setValues({});
    }
    setLoading(false);
  }

  function setField(key: string, val: FieldValue) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  // A boolean field always holds a value; others count as filled when non-blank.
  function filled(f: SchemaField): boolean {
    if (f.type === "boolean") return true;
    return String(values[f.key] ?? "").trim().length > 0;
  }

  function validate(): string | null {
    for (const f of schema) {
      if (f.required && !filled(f)) return `${f.label} is required`;
    }
    return null;
  }

  async function save() {
    if (!provider) return;
    const err = validate();
    if (err) { toast.error(err); return; }

    // Normalise url-typed fields before anything is persisted, so a missing scheme is
    // fixed here rather than surfacing as "Invalid URL" from the adapter's fetch().
    const cleaned: Record<string, FieldValue> = { ...values };
    for (const f of schema) {
      if (f.type !== "url") continue;
      const raw = cleaned[f.key];
      if (raw == null) continue;
      if (typeof raw !== "string") { toast.error(`${f.label} must be a valid http(s) URL`); return; }
      const url = normalizeHttpUrl(raw);
      if (url === null) { toast.error(`${f.label} must be a valid http(s) URL`); return; }
      cleaned[f.key] = url;
    }
    setValues(cleaned);
    setSaving(true);

    // Split secrets out — they go to Vault via admin-set-pos-credentials.
    const secretKeys = new Set(schema.filter((f) => f.type === "secret").map((f) => f.key));
    const nonSecret: Record<string, FieldValue> = {};
    const secretEntries: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(cleaned)) {
      if (secretKeys.has(k)) {
        if (typeof v === "string" && v.trim().length > 0) secretEntries.push([k, v]);
      } else {
        nonSecret[k] = v;
      }
    }

    const payload: any = {
      venue_id: venueId,
      provider_id: provider.id,
      pos_provider: provider.slug,
      config: nonSecret,
      connection_status: "connecting",
      // Drop any cached bearer: getHLToken reuses a cached token for ~24h, so a token
      // minted with the previous credentials would let the next test report "Connected"
      // without ever validating the ones just saved.
      token_cache: null,
    };

    const { data: existing } = await (supabase as any)
      .from("venue_pos_integrations").select("id").eq("venue_id", venueId).maybeSingle();

    const { error } = existing
      ? await (supabase as any).from("venue_pos_integrations").update(payload).eq("id", existing.id)
      : await (supabase as any).from("venue_pos_integrations").insert(payload);

    if (error) { setSaving(false); toast.error(error.message); return; }

    // Push each secret into Vault via the edge function.
    for (const [field, value] of secretEntries) {
      const { error: secErr } = await supabase.functions.invoke("admin-set-pos-credentials", {
        body: { venue_id: venueId, field, value },
      });
      if (secErr) {
        // Don't leave the row at "connecting" with only some secrets in Vault: that
        // reads as a connection in progress when nothing is usable. Mark it failed so
        // the state is explicit and the operator sees why.
        const { error: statusErr } = await (supabase as any).from("venue_pos_integrations")
          .update({
            connection_status: "error",
            last_error: `Failed to store ${field}: ${secErr.message}`,
          })
          .eq("venue_id", venueId);
        if (statusErr) console.error(statusErr);
        setSaving(false);
        toast.error(`Failed to store ${field}: ${secErr.message}`);
        onSaved?.();
        return;
      }
    }

    // Run the handshake so the status advances past "connecting".
    // pos-test-connection sets connection_status to "connected" or "error"
    // based on the live check — without this the row is stuck at "connecting".
    const { data: testData, error: testErr } = await supabase.functions.invoke("pos-test-connection", {
      body: { venue_id: venueId },
    });
    const testResult = testData as { ok?: boolean; message?: string } | null;
    setSaving(false);
    if (testErr) {
      toast.error(`Saved, but the connection test failed: ${testErr.message}`);
    } else if (testResult?.ok) {
      toast.success("Connected");
    } else {
      toast.error(testResult?.message || "Saved, but the connection test failed");
    }
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Connect POS Provider
          </DialogTitle>
          <DialogDescription>
            Pick a provider and supply the credentials it needs for this venue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading providers…</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active POS providers. Ask an admin to enable one in /admin/integrations.</p>
          ) : (
            <>
              {(() => {
                const renderField = (f: SchemaField) => {
                  if (f.type === "boolean") {
                    // Mirror the backend's reading of this flag rather than asking
                    // "is it explicitly on?": the adapter treats anything that is not
                    // an explicit `false` as on (cfg(ctx,"test_mode",true) !== false in
                    // _shared/hl-weborders-client.ts). Asking the same question keeps the
                    // switch honest when the key is absent or holds a stale non-boolean.
                    // Display only — nothing is written to config until the user toggles.
                    const on = values[f.key] !== false && values[f.key] !== "false";
                    return (
                      <div key={f.key} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Label className="text-xs">
                            {f.label} {f.required && <span className="text-destructive">*</span>}
                          </Label>
                          {f.help && <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{f.help}</p>}
                        </div>
                        <Switch checked={on} onCheckedChange={(c) => setField(f.key, c)} />
                      </div>
                    );
                  }
                  return (
                    <div key={f.key}>
                      <Label className="text-xs">
                        {f.label} {f.required && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        className="mt-1 h-9"
                        type={f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"}
                        placeholder={f.placeholder ?? (f.type === "secret" ? "Paste credential" : "")}
                        value={(values[f.key] as string | number | undefined) ?? ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                      {f.help && <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{f.help}</p>}
                    </div>
                  );
                };

                // Provider slot takes ~2 field-heights; balance fields across the remaining space.
                const total = schema.length;
                const card1Count = Math.max(0, Math.ceil((total - 1) / 3)); // fewer in card 1 (has provider)
                const remaining = total - card1Count;
                const card2Count = Math.ceil(remaining / 2);
                const card1Fields = schema.slice(0, card1Count);
                const card2Fields = schema.slice(card1Count, card1Count + card2Count);
                const card3Fields = schema.slice(card1Count + card2Count);

                const missing = schema.filter((f) => f.required && !filled(f));

                return (
                  <div className="grid gap-4 lg:grid-cols-3">
                    {/* Card 1 — Provider */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Plug className="h-4 w-4" /> 1. Provider
                        </CardTitle>
                        <CardDescription className="text-xs">Choose your POS system.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label className="text-xs">POS System</Label>
                          <Select value={providerId} onValueChange={(v) => { setProviderId(v); setValues({}); }}>
                            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {providers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} <span className="text-muted-foreground ml-1">({p.auth_type})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {provider && (
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">{provider.status}</Badge>
                            {Object.entries(provider.capabilities ?? {}).filter(([, v]) => v).map(([k]) => (
                              <Badge key={k} variant="secondary" className="text-[10px]">{k.replace(/_/g, " ")}</Badge>
                            ))}
                          </div>
                        )}
                        {card1Fields.map(renderField)}
                      </CardContent>
                    </Card>

                    {/* Card 2 — Configuration */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <KeyRound className="h-4 w-4" /> 2. Configuration
                        </CardTitle>
                        <CardDescription className="text-xs">Connection endpoints & IDs.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {card2Fields.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nothing to configure for this provider.</p>
                        ) : (
                          card2Fields.map(renderField)
                        )}
                      </CardContent>
                    </Card>

                    {/* Card 3 — Credentials + Review */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4" /> 3. Credentials & Review
                        </CardTitle>
                        <CardDescription className="text-xs">Encrypted keys + confirm.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {card3Fields.map(renderField)}
                        <div className="pt-2 border-t space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Filled</span>
                            <span className="font-medium">
                              {schema.filter(filled).length} / {schema.length}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Missing</span>
                            <span className="font-medium">
                              {missing.length === 0 ? "None" : missing.map((f) => f.label).join(", ")}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </>
          )}
        </div>


        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !provider}>
            {saving ? "Saving…" : "Save & Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
