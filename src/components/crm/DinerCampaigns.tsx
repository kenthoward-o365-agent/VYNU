import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Send, Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  channel: string;
  goal: string;
  status: string;
  is_ai_generated: boolean;
  is_instant: boolean;
  recipients_total: number;
  recipients_sent: number;
  recipients_opened: number;
  recipients_clicked: number;
  attributed_orders: number;
  attributed_revenue: number;
  scheduled_at: string | null;
  segment_id: string | null;
  subject: string | null;
  body_text: string | null;
  sms_text: string | null;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
}

const GOALS = [
  { value: "daily_special", label: "Daily special" },
  { value: "instant_special", label: "Instant special" },
  { value: "win_back", label: "Win-back" },
  { value: "birthday", label: "Birthday" },
  { value: "kitchen_load", label: "Boost kitchen load" },
  { value: "contest", label: "Contest" },
  { value: "announcement", label: "Announcement" },
  { value: "custom", label: "Custom" },
];

export default function DinerCampaigns() {
  const { venue } = useVenue();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<{ id: string; name: string; member_count: number }[]>([]);
  const [smsSubCount, setSmsSubCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const [{ data: c }, { data: s }, { count }] = await Promise.all([
      supabase.from("crm_campaigns" as any).select("*").eq("venue_id", venue.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("diner_segments" as any).select("id, name, member_count").eq("venue_id", venue.id).eq("is_archived", false),
      supabase.from("sms_subscribers" as any).select("*", { count: "exact", head: true })
        .eq("venue_id", venue.id).eq("marketing_opt_in", true).is("unsubscribed_at", null),
    ]);
    setCampaigns((c as any[]) as Campaign[] || []);
    setSegments((s as any[]) || []);
    setSmsSubCount(count || 0);
    setLoading(false);
  };
  useEffect(() => { load(); }, [venue]);


  const send = async (id: string) => {
    if (!confirm("Send this campaign now?")) return;
    const { data, error } = await supabase.functions.invoke("crm-send-campaign", { body: { campaign_id: id } });
    if (error || (data as any)?.error) toast({ title: "Send failed", description: (data as any)?.error || error?.message, variant: "destructive" });
    else { toast({ title: `Sent to ${(data as any).recipients} recipients` }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    await supabase.from("crm_campaigns" as any).delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Campaigns</h3>
          <p className="text-sm text-muted-foreground">Scheduled and instant AI campaigns</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New campaign</Button>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="grid grid-cols-1 gap-3">
          {campaigns.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No campaigns yet.</CardContent></Card>
          )}
          {campaigns.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:border-primary/50" onClick={() => setEditing(c)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {c.is_ai_generated && <Sparkles className="h-4 w-4 text-primary" />}
                    {c.is_instant && <Zap className="h-4 w-4 text-amber-500" />}
                    {c.name}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{c.channel}</Badge>
                    <Badge variant={c.status === "sent" ? "default" : c.status === "draft" ? "secondary" : "outline"}>{c.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <Stat label="Recipients" value={c.recipients_total} />
                <Stat label="Sent" value={c.recipients_sent} />
                <Stat label="Opens" value={c.recipients_opened} />
                <Stat label="Orders" value={c.attributed_orders} />
                <Stat label="Revenue" value={`$${Number(c.attributed_revenue || 0).toFixed(2)}`} />
                <div className="col-span-2 md:col-span-5 flex gap-2 pt-2 border-t">
                  {c.status === "draft" && <Button size="sm" onClick={(e) => { e.stopPropagation(); send(c.id); }}><Send className="h-3.5 w-3.5 mr-1" />Send now</Button>}
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(c.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CampaignEditor
        open={creating || !!editing}
        campaign={editing}
        venueId={venue?.id}
        segments={segments}
        smsSubCount={smsSubCount}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => { setEditing(null); setCreating(false); load(); }}
      />

    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function CampaignEditor({
  open, campaign, venueId, segments, smsSubCount, onClose, onSaved,
}: {
  open: boolean; campaign: Campaign | null; venueId?: string;
  segments: { id: string; name: string; member_count: number }[];
  smsSubCount: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  useEffect(() => {
    if (campaign) setForm(campaign);
    else setForm({
      name: "", channel: "email", goal: "daily_special", status: "draft",
      audience_type: "segment",
      segment_id: null, subject: "", body_text: "", sms_text: "", cta_label: "Order now", cta_url: "",
      is_ai_generated: false, is_instant: false,
    });
  }, [campaign, open]);


  const upd = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const draft = async () => {
    if (!venueId) return;
    setDrafting(true);
    const seg = segments.find((s) => s.id === form.segment_id);
    const { data, error } = await supabase.functions.invoke("crm-ai-compose", {
      body: { venue_id: venueId, goal: form.goal, channel: form.channel, prompt: aiPrompt, segment_name: seg?.name },
    });
    setDrafting(false);
    if (error || (data as any)?.error) {
      toast({ title: "AI failed", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    const d = (data as any).draft || {};
    upd({
      subject: d.subject || form.subject,
      body_text: d.body_text || form.body_text,
      sms_text: d.sms_text || form.sms_text,
      cta_label: d.cta_label || form.cta_label,
      is_ai_generated: true,
    });
    toast({ title: "Draft generated" });
  };

  const save = async (alsoSend = false) => {
    if (!venueId || !form.name) return;
    setSaving(true);
    const payload = { ...form, venue_id: venueId };
    delete payload.recipients_total; delete payload.recipients_sent; delete payload.recipients_opened;
    delete payload.recipients_clicked; delete payload.attributed_orders; delete payload.attributed_revenue;
    delete payload.created_at;
    let id = campaign?.id;
    if (id) {
      await supabase.from("crm_campaigns" as any).update(payload).eq("id", id);
    } else {
      const { data } = await supabase.from("crm_campaigns" as any).insert(payload).select("id").single();
      id = (data as any)?.id;
    }
    setSaving(false);
    toast({ title: campaign ? "Campaign saved" : "Campaign created" });
    if (alsoSend && id) {
      const { data, error } = await supabase.functions.invoke("crm-send-campaign", { body: { campaign_id: id } });
      if (error || (data as any)?.error) toast({ title: "Send failed", description: (data as any)?.error || error?.message, variant: "destructive" });
      else toast({ title: `Sent to ${(data as any).recipients} recipients` });
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name || ""} onChange={(e) => upd({ name: e.target.value })} /></div>
            <div>
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v) => upd({ channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="in_app">In-app</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Goal</Label>
              <Select value={form.goal} onValueChange={(v) => upd({ goal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GOALS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience (segment)</Label>
              <Select value={form.segment_id || ""} onValueChange={(v) => upd({ segment_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                <SelectContent>{segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.member_count})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="instant" checked={!!form.is_instant} onChange={(e) => upd({ is_instant: e.target.checked })} />
              <Label htmlFor="instant" className="cursor-pointer">Instant AI campaign (revenue counts toward AI total)</Label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-muted/30 space-y-2">
              <Label className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />AI brief</Label>
              <Textarea rows={2} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. 20% off pizzas tonight from 6-8pm" />
              <Button size="sm" variant="secondary" onClick={draft} disabled={drafting}>
                {drafting ? "Drafting…" : "Generate with AI"}
              </Button>
            </div>
            {form.channel === "email" && (
              <>
                <div><Label>Subject</Label><Input value={form.subject || ""} onChange={(e) => upd({ subject: e.target.value })} /></div>
                <div><Label>Body</Label><Textarea rows={5} value={form.body_text || ""} onChange={(e) => upd({ body_text: e.target.value })} /></div>
              </>
            )}
            {form.channel === "sms" && (
              <div><Label>SMS text (160 chars)</Label><Textarea rows={3} value={form.sms_text || ""} onChange={(e) => upd({ sms_text: e.target.value })} /></div>
            )}
            {(form.channel === "push" || form.channel === "in_app") && (
              <>
                <div><Label>Title</Label><Input value={form.push_title || ""} onChange={(e) => upd({ push_title: e.target.value })} /></div>
                <div><Label>Body</Label><Textarea rows={3} value={form.push_body || ""} onChange={(e) => upd({ push_body: e.target.value })} /></div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>CTA label</Label><Input value={form.cta_label || ""} onChange={(e) => upd({ cta_label: e.target.value })} /></div>
              <div><Label>CTA URL</Label><Input value={form.cta_url || ""} onChange={(e) => upd({ cta_url: e.target.value })} /></div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
          <Button onClick={() => save(true)} disabled={saving || !form.segment_id}>
            <Send className="h-3.5 w-3.5 mr-1" />Save & send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
