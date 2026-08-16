import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, BellRing, Check } from "lucide-react";
import { parseClubTiers, type ClubTier } from "@/lib/guest-suite";

interface Program {
  id: string;
  name: string;
  tiers: unknown;
  external_system: string | null;
  is_active: boolean;
}

interface Member {
  id: string;
  program_id: string;
  member_no: string;
  display_name: string | null;
  tier_key: string;
  status: string;
  external_ref: string | null;
  joined_at: string;
}

interface Signal {
  id: number;
  member_id: string;
  kind: string;
  note: string | null;
  occurred_at: string;
  acknowledged_at: string | null;
}

interface Promo {
  id: string;
  title: string;
  body: string | null;
  placement: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

const SIGNAL_LABEL: Record<string, string> = {
  vip_arrival: "VIP arrival",
  tier_change: "Tier change",
  milestone: "Milestone",
  service_alert: "Service alert",
};

export default function Club() {
  const { venue } = useVenue();
  const { user } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Partial<Member> | null>(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const [newSignal, setNewSignal] = useState<{ member_id: string; kind: string; note: string }>({
    member_id: "", kind: "vip_arrival", note: "",
  });
  const [promoOpen, setPromoOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Partial<Promo> | null>(null);

  const tiers: ClubTier[] = useMemo(() => parseClubTiers(program?.tiers), [program]);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data: prog, error: progErr } = await supabase
      .from("club_programs")
      .select("id, name, tiers, external_system, is_active")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (progErr) {
      toast.error("Failed to load club program");
      setLoading(false);
      return;
    }
    setProgram(prog as Program | null);
    if (prog) {
      const [m, s, p] = await Promise.all([
        supabase
          .from("club_members")
          .select("id, program_id, member_no, display_name, tier_key, status, external_ref, joined_at")
          .eq("venue_id", venue.id)
          .order("member_no")
          .limit(500),
        supabase
          .from("club_signals")
          .select("id, member_id, kind, note, occurred_at, acknowledged_at")
          .eq("venue_id", venue.id)
          .order("occurred_at", { ascending: false })
          .limit(50),
        supabase
          .from("club_promos")
          .select("id, title, body, placement, starts_at, ends_at, is_active")
          .eq("venue_id", venue.id)
          .order("sort_order"),
      ]);
      if (!m.error) setMembers(m.data as Member[]);
      if (!s.error) setSignals(s.data as Signal[]);
      if (!p.error) setPromos(p.data as Promo[]);
    } else {
      setMembers([]);
      setSignals([]);
      setPromos([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [venue?.id]);

  const createProgram = async () => {
    if (!venue) return;
    const { error } = await supabase.from("club_programs").insert({
      venue_id: venue.id,
      name: "Members",
      tiers: [
        { key: "member", label: "Member" },
        { key: "silver", label: "Silver" },
        { key: "gold", label: "Gold" },
        { key: "vip", label: "VIP" },
      ],
    });
    if (error) return toast.error(error.message);
    toast.success("Club program created");
    load();
  };

  const memberName = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m ? m.display_name || `#${m.member_no}` : "Member";
  };

  const tierLabel = (key: string) => tiers.find((t) => t.key === key)?.label ?? key;

  const visibleMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.member_no.toLowerCase().includes(q) ||
        (m.display_name ?? "").toLowerCase().includes(q) ||
        (m.external_ref ?? "").toLowerCase().includes(q),
    );
  }, [members, search]);

  const saveMember = async () => {
    if (!editingMember || !venue || !program) return;
    if (!editingMember.member_no?.trim()) return toast.error("Member number is required");
    const payload = {
      venue_id: venue.id,
      program_id: program.id,
      member_no: editingMember.member_no.trim(),
      display_name: editingMember.display_name?.trim() || null,
      tier_key: editingMember.tier_key || tiers[0].key,
      status: editingMember.status || "active",
      external_ref: editingMember.external_ref?.trim() || null,
    };
    if (editingMember.id) {
      const { error } = await supabase.from("club_members").update(payload).eq("id", editingMember.id);
      if (error) return toast.error(error.message);
      toast.success("Member updated");
    } else {
      const { error } = await supabase.from("club_members").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Member added");
    }
    setMemberOpen(false);
    setEditingMember(null);
    load();
  };

  const logSignal = async () => {
    if (!venue || !newSignal.member_id) return toast.error("Pick a member");
    const { error } = await supabase.from("club_signals").insert({
      venue_id: venue.id,
      member_id: newSignal.member_id,
      kind: newSignal.kind,
      note: newSignal.note.trim() || null,
    });
    if (error) return toast.error(error.message);
    setSignalOpen(false);
    setNewSignal({ member_id: "", kind: "vip_arrival", note: "" });
    load();
  };

  const acknowledge = async (s: Signal) => {
    const { error } = await supabase
      .from("club_signals")
      .update({ acknowledged_by: user?.id ?? null, acknowledged_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  const savePromo = async () => {
    if (!editingPromo || !venue) return;
    if (!editingPromo.title?.trim()) return toast.error("Title is required");
    const payload = {
      venue_id: venue.id,
      title: editingPromo.title.trim(),
      body: editingPromo.body?.trim() || null,
      placement: editingPromo.placement || "promo_screen",
      starts_at: editingPromo.starts_at || null,
      ends_at: editingPromo.ends_at || null,
      is_active: editingPromo.is_active ?? true,
    };
    if (editingPromo.id) {
      const { error } = await supabase.from("club_promos").update(payload).eq("id", editingPromo.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("club_promos")
        .insert({ ...payload, sort_order: promos.length });
      if (error) return toast.error(error.message);
    }
    setPromoOpen(false);
    setEditingPromo(null);
    load();
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  if (!loading && !program) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Club</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Member scheme surface for gaming venues — compliant by design.
          </p>
        </div>
        <Card className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">
            No club program yet. The Club module surfaces your member scheme —
            tiers, VIP alerts for the floor, and promo screens. Gaming signals
            stay staff-side only and never appear on any diner surface.
          </p>
          <Button onClick={createProgram}>Create club program</Button>
        </Card>
      </div>
    );
  }

  const unacked = signals.filter((s) => !s.acknowledged_at);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Club{program ? ` — ${program.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Member scheme, VIP alerts and promo screens. Gaming signals are staff-side only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSignalOpen(true)}>
            <BellRing className="h-4 w-4 mr-2" />
            Log signal
          </Button>
          <Button size="sm" onClick={() => {
            setEditingMember({ tier_key: tiers[0]?.key, status: "active" });
            setMemberOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Add member
          </Button>
        </div>
      </div>

      {/* Signals feed */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <h2 className="font-semibold text-foreground">Floor signals</h2>
          {unacked.length > 0 && <Badge variant="destructive">{unacked.length} new</Badge>}
        </div>
        {signals.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No signals. VIP arrivals, tier changes and service alerts land here for the floor team.
          </div>
        ) : (
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {signals.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{memberName(s.member_id)}</span>
                    <Badge
                      variant={s.kind === "vip_arrival" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {SIGNAL_LABEL[s.kind] ?? s.kind}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.occurred_at).toLocaleTimeString("en-AU", {
                        hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {s.note && <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>}
                </div>
                {s.acknowledged_at ? (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />Seen
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => acknowledge(s)}>
                    Acknowledge
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Members */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-foreground">
            Members <span className="text-muted-foreground font-normal">({members.length})</span>
          </h2>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            className="w-56"
          />
        </div>
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 text-muted-foreground">Loading…</div>
          ) : visibleMembers.length === 0 ? (
            <div className="p-6 text-muted-foreground">No members{search ? " match" : " yet"}.</div>
          ) : (
            <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
              {visibleMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">
                        {m.display_name || `Member #${m.member_no}`}
                      </span>
                      <code className="text-xs text-muted-foreground">#{m.member_no}</code>
                      <Badge variant="secondary" className="text-xs">{tierLabel(m.tier_key)}</Badge>
                      {m.status !== "active" && (
                        <Badge variant="destructive" className="text-xs capitalize">{m.status}</Badge>
                      )}
                    </div>
                    {m.external_ref && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Gaming ref: {m.external_ref}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="icon" aria-label="Edit member"
                    onClick={() => { setEditingMember({ ...m }); setMemberOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Promos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">Promo screens</h2>
          <Button variant="outline" size="sm" onClick={() => {
            setEditingPromo({ placement: "promo_screen", is_active: true });
            setPromoOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New promo
          </Button>
        </div>
        <Card className="p-0 overflow-hidden">
          {promos.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No promos yet. Promos rotate on in-venue screens for members.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {promos.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{p.title}</span>
                      {!p.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                    </div>
                    {p.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.body}</p>}
                  </div>
                  <Button
                    variant="ghost" size="icon" aria-label="Edit promo"
                    onClick={() => { setEditingPromo({ ...p }); setPromoOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Member dialog */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMember?.id ? "Edit member" : "Add member"}</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="member_no">Member no. *</Label>
                  <Input
                    id="member_no"
                    value={editingMember.member_no || ""}
                    onChange={(e) => setEditingMember({ ...editingMember, member_no: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="display_name">Name</Label>
                  <Input
                    id="display_name"
                    value={editingMember.display_name || ""}
                    onChange={(e) => setEditingMember({ ...editingMember, display_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tier</Label>
                  <Select
                    value={editingMember.tier_key || tiers[0]?.key}
                    onValueChange={(v) => setEditingMember({ ...editingMember, tier_key: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tiers.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={editingMember.status || "active"}
                    onValueChange={(v) => setEditingMember({ ...editingMember, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="lapsed">Lapsed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="external_ref">Gaming system ref</Label>
                  <Input
                    id="external_ref"
                    value={editingMember.external_ref || ""}
                    onChange={(e) => setEditingMember({ ...editingMember, external_ref: e.target.value })}
                    placeholder="Member id in the gaming system"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberOpen(false)}>Cancel</Button>
            <Button onClick={saveMember}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signal dialog */}
      <Dialog open={signalOpen} onOpenChange={setSignalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a floor signal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Member</Label>
              <Select
                value={newSignal.member_id}
                onValueChange={(v) => setNewSignal({ ...newSignal, member_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name || `#${m.member_no}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select
                value={newSignal.kind}
                onValueChange={(v) => setNewSignal({ ...newSignal, kind: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SIGNAL_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="signal_note">Note</Label>
              <Textarea
                id="signal_note"
                rows={2}
                value={newSignal.note}
                onChange={(e) => setNewSignal({ ...newSignal, note: e.target.value })}
                placeholder="e.g. Prefers the corner booth"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Signals are visible to venue staff only — never to guests, and never
              on a diner-facing surface.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignalOpen(false)}>Cancel</Button>
            <Button onClick={logSignal}>Log signal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promo dialog */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPromo?.id ? "Edit promo" : "New promo"}</DialogTitle>
          </DialogHeader>
          {editingPromo && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="promo_title">Title *</Label>
                <Input
                  id="promo_title"
                  value={editingPromo.title || ""}
                  onChange={(e) => setEditingPromo({ ...editingPromo, title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo_body">Body</Label>
                <Textarea
                  id="promo_body"
                  rows={2}
                  value={editingPromo.body || ""}
                  onChange={(e) => setEditingPromo({ ...editingPromo, body: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Placement</Label>
                <Select
                  value={editingPromo.placement || "promo_screen"}
                  onValueChange={(v) => setEditingPromo({ ...editingPromo, placement: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="promo_screen">Promo screen</SelectItem>
                    <SelectItem value="in_venue">In venue</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-sm">Active</span>
                <input
                  type="checkbox"
                  checked={editingPromo.is_active ?? true}
                  onChange={(e) => setEditingPromo({ ...editingPromo, is_active: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoOpen(false)}>Cancel</Button>
            <Button onClick={savePromo}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
