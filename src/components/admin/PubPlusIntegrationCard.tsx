import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Beer, ExternalLink, RefreshCw, Save, ScanLine } from "lucide-react";
import { toast } from "sonner";

interface GroupRow {
  id: string;
  name: string;
}

interface PubPlusIntegration {
  id?: string;
  group_id: string;
  enabled: boolean;
  environment: "sandbox" | "production";
  base_url: string;
  client_id: string | null;
  parent_identity_number: string | null;
  auto_earn_on_paid: boolean;
  identity_type: string;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
}

const blank = (groupId: string): PubPlusIntegration => ({
  group_id: groupId,
  enabled: false,
  environment: "sandbox",
  base_url: "https://poseidon-uat.eagleeye.com",
  client_id: "",
  parent_identity_number: "",
  auto_earn_on_paid: true,
  identity_type: "BARCODE",
  last_test_at: null,
  last_test_ok: null,
  last_test_message: null,
});

/**
 * Eagle Eye AIR (Pub+) integration configuration.
 * Credentials themselves live in backend secrets — only non-secret routing
 * settings are stored here.
 */
export default function PubPlusIntegrationCard() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [cfg, setCfg] = useState<PubPlusIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [linkCount, setLinkCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("venue_groups").select("id, name").order("name");
      const rows = (data ?? []) as GroupRow[];
      setGroups(rows);
      if (rows.length) setGroupId(rows[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!groupId) return;
    void (async () => {
      setLoading(true);
      const [{ data }, { count }] = await Promise.all([
        (supabase as any).from("pubplus_integrations").select("*").eq("group_id", groupId).maybeSingle(),
        (supabase as any)
          .from("pubplus_member_links")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("status", "linked"),
      ]);
      setCfg((data as PubPlusIntegration) ?? blank(groupId));
      setLinkCount(count ?? 0);
      setLoading(false);
    })();
  }, [groupId]);

  const patch = (p: Partial<PubPlusIntegration>) => setCfg((c) => (c ? { ...c, ...p } : c));

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const payload = {
      group_id: cfg.group_id,
      enabled: cfg.enabled,
      environment: cfg.environment,
      base_url: cfg.base_url.trim(),
      client_id: cfg.client_id?.trim() || null,
      parent_identity_number: cfg.parent_identity_number?.trim() || null,
      auto_earn_on_paid: cfg.auto_earn_on_paid,
      identity_type: cfg.identity_type,
    };
    const { data, error } = cfg.id
      ? await (supabase as any).from("pubplus_integrations").update(payload).eq("id", cfg.id).select().single()
      : await (supabase as any).from("pubplus_integrations").insert(payload).select().single();
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      setCfg(data as PubPlusIntegration);
      toast.success("Pub+ integration saved");
    }
  }

  async function test() {
    if (!cfg?.group_id) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("pubplus-air", {
      body: { action: "test", group_id: cfg.group_id },
    });
    setTesting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as any;
    if (res?.ok) toast.success(res.message ?? "Connected to Eagle Eye AIR");
    else toast.error(res?.message ?? "Connection failed");
    patch({
      last_test_at: new Date().toISOString(),
      last_test_ok: !!res?.ok,
      last_test_message: res?.message ?? null,
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Beer className="h-4 w-4 text-primary" />
              Pub+ (ALH · Eagle Eye AIR)
              {cfg?.enabled ? (
                <Badge>Enabled</Badge>
              ) : (
                <Badge variant="outline">Disabled</Badge>
              )}
              {cfg?.last_test_ok === true && <Badge variant="secondary">Last test OK</Badge>}
              {cfg?.last_test_ok === false && <Badge variant="destructive">Last test failed</Badge>}
            </CardTitle>
            <CardDescription className="mt-1">
              Loyalty / rewards integration · eagle-eye-air · client credentials + auth hash
            </CardDescription>
          </div>
          {groups.length > 0 && (
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>Two-way sync with the ALH Pub+ platform (Eagle Eye AIR):</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Member identity match</strong> — a diner links their existing Pub+ card by typing or
              scanning its barcode; OrderNOW resolves the Eagle Eye wallet behind that identity.
            </li>
            <li>
              <strong>Points earn</strong> — when an order is paid, the basket is posted to Eagle Eye so points
              land on the diner's real Pub+ balance. No barcode scan at the bar required.
            </li>
            <li>
              <strong>Redemption</strong> — pub+ coins and member offers are read from the Eagle Eye wallet and
              settled back against it.
            </li>
          </ul>
        </div>

        {loading || !cfg ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={cfg.enabled} onCheckedChange={(v) => patch({ enabled: v })} id="pp-enabled" />
                <Label htmlFor="pp-enabled">Integration enabled</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={cfg.auto_earn_on_paid}
                  onCheckedChange={(v) => patch({ auto_earn_on_paid: v })}
                  id="pp-auto"
                />
                <Label htmlFor="pp-auto">Auto-post points when an order is paid</Label>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ScanLine className="h-4 w-4" />
                {linkCount} linked member{linkCount === 1 ? "" : "s"}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Environment</Label>
                <Select
                  value={cfg.environment}
                  onValueChange={(v) =>
                    patch({
                      environment: v as PubPlusIntegration["environment"],
                      base_url:
                        v === "production"
                          ? "https://poseidon.eagleeye.com"
                          : "https://poseidon-uat.eagleeye.com",
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (UAT)</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">API base URL</Label>
                <Input value={cfg.base_url} onChange={(e) => patch({ base_url: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client / partner ID</Label>
                <Input
                  value={cfg.client_id ?? ""}
                  placeholder="Provided by ALH"
                  onChange={(e) => patch({ client_id: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parent identity (POS ref)</Label>
                <Input
                  value={cfg.parent_identity_number ?? ""}
                  placeholder="e.g. 0000000000000"
                  onChange={(e) => patch({ parent_identity_number: e.target.value })}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The Eagle Eye client secret and auth-hash key are stored as backend secrets
              (<code>PUBPLUS_EE_CLIENT_SECRET</code>, <code>PUBPLUS_EE_AUTH_KEY</code>) — never in the database.
            </p>

            {cfg.last_test_message && (
              <p className={`text-xs ${cfg.last_test_ok ? "text-muted-foreground" : "text-destructive"}`}>
                Last test{cfg.last_test_at ? ` (${new Date(cfg.last_test_at).toLocaleString()})` : ""}:{" "}
                {cfg.last_test_message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-3 w-3 mr-1" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={test} disabled={testing || !cfg.id}>
                <RefreshCw className={`h-3 w-3 mr-1 ${testing ? "animate-spin" : ""}`} />
                Test connection
              </Button>
              <a
                href="https://developer.eagleeye.com/eagleeye-developer/docs/air-platform-overview"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Eagle Eye AIR docs <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://www.pubplus.com.au/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                pubplus.com.au <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
