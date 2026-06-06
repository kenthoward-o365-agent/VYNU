import { useEffect, useMemo, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Op = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "between";

interface Rule {
  field: string;
  op: Op;
  val: any;
}

interface Segment {
  id: string;
  name: string;
  description: string | null;
  kind: "static" | "dynamic" | "ai_lookalike";
  rules: { logic: "AND" | "OR"; rules: Rule[] };
  member_count: number;
  last_refreshed_at: string | null;
}

const FIELD_OPTIONS = [
  { value: "lifetime_spend", label: "Lifetime spend ($)" },
  { value: "lifetime_orders", label: "Lifetime orders" },
  { value: "avg_ticket", label: "Avg ticket ($)" },
  { value: "visit_count_90d", label: "Visits in last 90 days" },
  { value: "spend_last_30d", label: "Spend last 30 days" },
  { value: "rfm_tier", label: "RFM tier" },
  { value: "days_since_last_visit", label: "Days since last visit" },
  { value: "birthday_month", label: "Birthday month (1-12)" },
  { value: "birthday_day", label: "Birthday day (1-31)" },
  { value: "has_email", label: "Has email" },
  { value: "has_sms", label: "Has SMS number" },
  { value: "opt_in_email", label: "Email opt-in" },
  { value: "opt_in_sms", label: "SMS opt-in" },
];

const OP_OPTIONS: { value: Op; label: string }[] = [
  { value: "=", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "in", label: "in (comma list)" },
  { value: "between", label: "between (a,b)" },
];

export default function DinerSegments() {
  const { venue } = useVenue();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data } = await supabase
      .from("diner_segments" as any)
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    setSegments((data as any[])?.map((s) => ({ ...s, rules: s.rules || { logic: "AND", rules: [] } })) as Segment[] || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [venue]);

  const refresh = async (id: string) => {
    const { error } = await supabase.rpc("refresh_diner_segment_members" as any, { _segment_id: id });
    if (error) toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Segment refreshed" }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this segment?")) return;
    await supabase.from("diner_segments" as any).update({ is_archived: true }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Segments</h3>
          <p className="text-sm text-muted-foreground">Audiences for campaigns and automations</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New segment</Button>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {segments.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No segments yet. Create your first audience.</CardContent></Card>
          )}
          {segments.map((s) => (
            <Card key={s.id} className="cursor-pointer hover:border-primary/50" onClick={() => setEditing(s)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <Badge variant={s.kind === "ai_lookalike" ? "default" : "secondary"}>{s.kind}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.member_count} diners</span>
                  <span className="text-muted-foreground text-xs">
                    {s.last_refreshed_at ? `Updated ${new Date(s.last_refreshed_at).toLocaleString()}` : "Never refreshed"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); refresh(s.id); }}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(s.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SegmentEditor
        open={creating || !!editing}
        segment={editing}
        venueId={venue?.id}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => { setEditing(null); setCreating(false); load(); }}
      />
    </div>
  );
}

function SegmentEditor({
  open, segment, venueId, onClose, onSaved,
}: { open: boolean; segment: Segment | null; venueId?: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (segment) {
      setName(segment.name); setDescription(segment.description || "");
      setLogic(segment.rules?.logic || "AND");
      setRules(segment.rules?.rules || []);
    } else {
      setName(""); setDescription(""); setLogic("AND"); setRules([]);
    }
  }, [segment, open]);

  const addRule = () => setRules((r) => [...r, { field: "lifetime_spend", op: ">=", val: 100 }]);
  const updateRule = (i: number, patch: Partial<Rule>) => setRules((r) => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeRule = (i: number) => setRules((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!venueId || !name) return;
    setSaving(true);
    const payload: any = {
      venue_id: venueId, name, description: description || null, kind: "dynamic",
      rules: { logic, rules: rules.map((r) => ({ ...r, val: parseVal(r.op, r.val) })) },
    };
    let id = segment?.id;
    if (id) {
      await supabase.from("diner_segments" as any).update(payload).eq("id", id);
    } else {
      const { data } = await supabase.from("diner_segments" as any).insert(payload).select("id").single();
      id = (data as any)?.id;
    }
    if (id) await supabase.rpc("refresh_diner_segment_members" as any, { _segment_id: id });
    setSaving(false);
    toast({ title: segment ? "Segment updated" : "Segment created" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{segment ? "Edit segment" : "New segment"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP big spenders" /></div>
            <div>
              <Label>Match</Label>
              <Select value={logic} onValueChange={(v) => setLogic(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">All rules (AND)</SelectItem>
                  <SelectItem value="OR">Any rule (OR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Rules</Label>
              <Button size="sm" variant="outline" onClick={addRule}><Plus className="h-3.5 w-3.5 mr-1" />Add rule</Button>
            </div>
            {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules — segment will include all diners.</p>}
            {rules.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Select value={r.field} onValueChange={(v) => updateRule(i, { field: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Select value={r.op} onValueChange={(v) => updateRule(i, { op: v as Op })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input value={String(r.val ?? "")} onChange={(e) => updateRule(i, { val: e.target.value })} placeholder="value" />
                </div>
                <div className="col-span-1">
                  <Button size="icon" variant="ghost" onClick={() => removeRule(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Tip: use <code>current_month</code> or <code>current_day</code> for birthday rules.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name}>{saving ? "Saving…" : "Save & refresh"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseVal(op: Op, raw: any): any {
  if (raw === null || raw === undefined || raw === "") return raw;
  if (op === "in") return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
  if (op === "between") {
    const parts = String(raw).split(",").map((x) => x.trim());
    return [parts[0], parts[1]];
  }
  if (raw === "current_month" || raw === "current_day") return raw;
  const num = Number(raw);
  return Number.isFinite(num) && String(num) === String(raw).trim() ? num : raw;
}
