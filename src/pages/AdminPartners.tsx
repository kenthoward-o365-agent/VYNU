import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type PartnerType = "pos" | "crm";
interface Partner {
  id: string;
  name: string;
  contact_email: string | null;
  partner_type: PartnerType;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}
interface ApiKey {
  id: string;
  partner_id: string;
  venue_id: string | null;
  key_prefix: string;
  scopes: string[];
  label: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
interface Webhook {
  id: string;
  partner_id: string;
  venue_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_delivery_at: string | null;
  last_delivery_status: number | null;
}
interface Venue { id: string; name: string }

const POS_SCOPES = ["orders:read", "orders:write", "status:write", "menu:write", "snooze:write", "busy:write"];
const CRM_SCOPES = ["diners:read", "visits:read", "vouchers:write", "vouchers:read"];
const POS_EVENTS = ["order.created", "order.status_changed"];
const CRM_EVENTS = ["diner.created", "diner.updated", "loyalty.balance_changed"];

export default function AdminPartners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  // Create partner dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pType, setPType] = useState<PartnerType>("pos");
  const [pNotes, setPNotes] = useState("");

  // Issue key dialog
  const [keyDialogPartner, setKeyDialogPartner] = useState<Partner | null>(null);
  const [keyVenueId, setKeyVenueId] = useState<string>("");
  const [keyScopes, setKeyScopes] = useState<string[]>([]);
  const [keyLabel, setKeyLabel] = useState("");
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  // Webhook dialog
  const [whDialogPartner, setWhDialogPartner] = useState<Partner | null>(null);
  const [whVenueId, setWhVenueId] = useState<string>("");
  const [whUrl, setWhUrl] = useState("");
  const [whEvents, setWhEvents] = useState<string[]>([]);
  const [issuedWebhookSecret, setIssuedWebhookSecret] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, k, w, v] = await Promise.all([
      supabase.from("api_partners").select("*").order("created_at", { ascending: false }),
      supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
      (supabase as any).rpc("list_api_webhooks_safe"),
      supabase.from("venues").select("id, name").order("name"),
    ]);
    setPartners((p.data ?? []) as Partner[]);
    setKeys((k.data ?? []) as ApiKey[]);
    setWebhooks((w.data ?? []) as Webhook[]);
    setVenues((v.data ?? []) as Venue[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function createPartner() {
    if (!pName) return toast.error("Name required");
    const { error } = await supabase.from("api_partners").insert({
      name: pName, contact_email: pEmail || null, partner_type: pType, notes: pNotes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Partner created");
    setCreateOpen(false); setPName(""); setPEmail(""); setPNotes(""); setPType("pos");
    void load();
  }

  async function togglePartner(id: string, active: boolean) {
    await supabase.from("api_partners").update({ is_active: active }).eq("id", id);
    void load();
  }

  async function issueKey() {
    if (!keyDialogPartner) return;
    if (keyScopes.length === 0) return toast.error("Select at least one scope");
    const { data, error } = await supabase.functions.invoke("admin-issue-api-key", {
      body: {
        partner_id: keyDialogPartner.id,
        venue_id: keyVenueId || null,
        scopes: keyScopes,
        label: keyLabel || null,
      },
    });
    if (error) return toast.error(error.message);
    setIssuedKey(data.full_key);
    setKeyDialogPartner(null);
    setKeyVenueId(""); setKeyScopes([]); setKeyLabel("");
    void load();
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    void load();
  }

  async function createWebhook() {
    if (!whDialogPartner || !whVenueId || !whUrl) return toast.error("Venue and URL required");
    if (whEvents.length === 0) return toast.error("Select at least one event");
    // Secret is generated server-side and stored in Vault; we only see it once here.
    const { data, error } = await (supabase as any).rpc("create_api_webhook", {
      _partner_id: whDialogPartner.id,
      _venue_id: whVenueId,
      _url: whUrl,
      _events: whEvents,
    });
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    setIssuedWebhookSecret(row?.secret ?? null);
    toast.success("Webhook registered — copy the secret now, it won't be shown again");
    setWhDialogPartner(null); setWhVenueId(""); setWhUrl(""); setWhEvents([]);
    void load();
  }

  const allowedScopes = keyDialogPartner?.partner_type === "pos" ? POS_SCOPES : CRM_SCOPES;
  const allowedEvents = whDialogPartner?.partner_type === "pos" ? POS_EVENTS : CRM_EVENTS;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Partners</h1>
          <p className="text-muted-foreground">Issue and manage scoped credentials for POS and CRM partners.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New Partner</Button>
      </div>

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="partners">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Actions</th></tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3"><Badge variant={p.partner_type === "pos" ? "default" : "secondary"}>{p.partner_type.toUpperCase()}</Badge></td>
                      <td className="p-3 text-muted-foreground">{p.contact_email}</td>
                      <td className="p-3"><Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Active" : "Disabled"}</Badge></td>
                      <td className="p-3 space-x-2">
                        <Button size="sm" variant="outline" onClick={() => { setKeyDialogPartner(p); setKeyScopes([]); }}>Issue Key</Button>
                        <Button size="sm" variant="outline" onClick={() => setWhDialogPartner(p)}>Add Webhook</Button>
                        <Button size="sm" variant="ghost" onClick={() => togglePartner(p.id, !p.is_active)}>{p.is_active ? "Disable" : "Enable"}</Button>
                      </td>
                    </tr>
                  ))}
                  {partners.length === 0 && !loading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No partners yet.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-3 text-left">Prefix</th><th className="p-3 text-left">Partner</th><th className="p-3 text-left">Venue</th><th className="p-3 text-left">Scopes</th><th className="p-3 text-left">Last used</th><th className="p-3 text-left">Status</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const partner = partners.find((p) => p.id === k.partner_id);
                    const venue = venues.find((v) => v.id === k.venue_id);
                    return (
                      <tr key={k.id} className="border-t">
                        <td className="p-3 font-mono text-xs">{k.key_prefix}</td>
                        <td className="p-3">{partner?.name}</td>
                        <td className="p-3 text-muted-foreground">{venue?.name ?? "—"}</td>
                        <td className="p-3"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}</div></td>
                        <td className="p-3 text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</td>
                        <td className="p-3"><Badge variant={k.revoked_at ? "outline" : "default"}>{k.revoked_at ? "Revoked" : "Active"}</Badge></td>
                        <td className="p-3">{!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}>Revoke</Button>}</td>
                      </tr>
                    );
                  })}
                  {keys.length === 0 && !loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No keys yet.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-3 text-left">Partner</th><th className="p-3 text-left">Venue</th><th className="p-3 text-left">URL</th><th className="p-3 text-left">Events</th><th className="p-3 text-left">Last delivery</th></tr>
                </thead>
                <tbody>
                  {webhooks.map((w) => {
                    const partner = partners.find((p) => p.id === w.partner_id);
                    const venue = venues.find((v) => v.id === w.venue_id);
                    return (
                      <tr key={w.id} className="border-t">
                        <td className="p-3">{partner?.name}</td>
                        <td className="p-3">{venue?.name}</td>
                        <td className="p-3 font-mono text-xs truncate max-w-sm">{w.url}</td>
                        <td className="p-3"><div className="flex flex-wrap gap-1">{w.events.map((e) => <Badge key={e} variant="outline" className="text-xs">{e}</Badge>)}</div></td>
                        <td className="p-3 text-muted-foreground">{w.last_delivery_status ? `${w.last_delivery_status} · ${w.last_delivery_at ? new Date(w.last_delivery_at).toLocaleString() : ""}` : "—"}</td>
                      </tr>
                    );
                  })}
                  {webhooks.length === 0 && !loading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No webhooks yet.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create partner */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Partner</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={pName} onChange={(e) => setPName(e.target.value)} /></div>
            <div><Label>Contact email</Label><Input type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} /></div>
            <div>
              <Label>Type (immutable)</Label>
              <Select value={pType} onValueChange={(v) => setPType(v as PartnerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pos">POS — orders, menu, status, snooze</SelectItem>
                  <SelectItem value="crm">CRM — diners, visits, vouchers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={pNotes} onChange={(e) => setPNotes(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={createPartner}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue key */}
      <Dialog open={!!keyDialogPartner} onOpenChange={(o) => !o && setKeyDialogPartner(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue API Key — {keyDialogPartner?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Venue (optional — leave blank for group-wide)</Label>
              <Select value={keyVenueId} onValueChange={setKeyVenueId}>
                <SelectTrigger><SelectValue placeholder="All venues" /></SelectTrigger>
                <SelectContent>
                  {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {allowedScopes.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={keyScopes.includes(s)} onCheckedChange={(v) => setKeyScopes(v ? [...keyScopes, s] : keyScopes.filter((x) => x !== s))} />
                    <span className="font-mono text-xs">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div><Label>Label (e.g. "Production")</Label><Input value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={issueKey}>Issue Key</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issued key reveal */}
      <Dialog open={!!issuedKey} onOpenChange={(o) => !o && setIssuedKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>API Key Issued</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Copy this key now. It will not be shown again.</p>
          <div className="bg-muted p-3 rounded font-mono text-xs break-all">{issuedKey}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(issuedKey ?? ""); toast.success("Copied"); }}>Copy</Button>
            <Button onClick={() => setIssuedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add webhook */}
      <Dialog open={!!whDialogPartner} onOpenChange={(o) => !o && setWhDialogPartner(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Webhook — {whDialogPartner?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Venue</Label>
              <Select value={whVenueId} onValueChange={setWhVenueId}>
                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>{venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>URL</Label><Input type="url" placeholder="https://partner.example.com/webhook" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} /></div>
            <div>
              <Label>Events</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {allowedEvents.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={whEvents.includes(e)} onCheckedChange={(v) => setWhEvents(v ? [...whEvents, e] : whEvents.filter((x) => x !== e))} />
                    <span className="font-mono text-xs">{e}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={createWebhook}>Register</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
