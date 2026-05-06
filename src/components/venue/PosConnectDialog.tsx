import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plug } from "lucide-react";

interface SchemaField {
  key: string;
  label: string;
  type: "text" | "secret" | "number" | "url";
  required?: boolean;
  placeholder?: string;
  help?: string;
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
  const [values, setValues] = useState<Record<string, string>>({});
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
      (supabase as any).from("pos_providers").select("*").eq("is_active", true).order("name"),
      (supabase as any).from("venue_pos_integrations").select("provider_id, config").eq("venue_id", venueId).maybeSingle(),
    ]);
    const list = (provs ?? []) as Provider[];
    setProviders(list);
    if (existing?.provider_id) {
      setProviderId(existing.provider_id);
      setValues((existing.config ?? {}) as Record<string, string>);
    } else if (list.length > 0) {
      setProviderId(list[0].id);
      setValues({});
    }
    setLoading(false);
  }

  function setField(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function validate(): string | null {
    for (const f of schema) {
      if (f.required && !(values[f.key] ?? "").trim()) return `${f.label} is required`;
    }
    return null;
  }

  async function save() {
    if (!provider) return;
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);

    // Split secrets out — they go to Vault via admin-set-pos-credentials.
    const secretKeys = new Set(schema.filter((f) => f.type === "secret").map((f) => f.key));
    const nonSecret: Record<string, string> = {};
    const secretEntries: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(values)) {
      if (secretKeys.has(k)) {
        if (v && v.trim().length > 0) secretEntries.push([k, v]);
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
        setSaving(false);
        toast.error(`Failed to store ${field}: ${secErr.message}`);
        return;
      }
    }

    setSaving(false);
    toast.success("Integration saved");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Connect POS Provider
          </DialogTitle>
          <DialogDescription>
            Pick a provider and supply the credentials it needs for this venue.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading providers…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active POS providers. Ask an admin to enable one in /admin/integrations.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Provider</Label>
              <Select value={providerId} onValueChange={(v) => { setProviderId(v); setValues({}); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground ml-1">({p.auth_type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {provider && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant="outline">{provider.status}</Badge>
                  {Object.entries(provider.capabilities ?? {}).filter(([, v]) => v).map(([k]) => (
                    <Badge key={k} variant="secondary" className="text-xs">{k.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              )}
            </div>

            {schema.length === 0 ? (
              <p className="text-xs text-muted-foreground">This provider needs no extra configuration.</p>
            ) : (
              <div className="space-y-3">
                {schema.map((f) => (
                  <div key={f.key}>
                    <Label>
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      className="mt-1"
                      type={f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"}
                      placeholder={f.placeholder ?? (f.type === "secret" ? "Paste credential" : "")}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                    {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
                    {f.type === "secret" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Stored encrypted in venue config and accessed only by backend functions.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !provider}>
            {saving ? "Saving…" : "Save & Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
