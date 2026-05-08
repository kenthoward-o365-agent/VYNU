import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Building2, DollarSign, ShoppingCart, TrendingUp, Settings, Users, Gift,
  Plus, Trash2, Pencil, Search, Check, Mail, Phone, AlertTriangle, Star, Cake, Award, Sparkles, Settings2
} from "lucide-react";
import ShyndigLoyaltyEditor from "@/components/venue/ShyndigLoyaltyEditor";
import { toast } from "@/hooks/use-toast";

/* ── Types ── */
interface GroupSettings {
  global_diners?: boolean;
  global_loyalty?: boolean;
}

interface LoyaltyRules {
  points_per_dollar?: number;
  signup_bonus?: number;
  birthday_reward?: { enabled: boolean; points?: number; discount_percent?: number; description?: string };
  anniversary_reward?: { enabled: boolean; points?: number; discount_percent?: number; description?: string };
  milestones?: { threshold: number; reward_type: "points" | "discount" | "free_item"; value: number; description: string }[];
}

interface LoyaltyProgram {
  id: string;
  name: string;
  program_type: string;
  rules: LoyaltyRules;
  is_active: boolean;
  group_id: string | null;
  venue_id: string | null;
}

interface DinerRow {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  allergens: string[];
  visit_count: number;
  last_visit: string | null;
}

const defaultRules: LoyaltyRules = {
  points_per_dollar: 1,
  signup_bonus: 0,
  birthday_reward: { enabled: false, points: 50, discount_percent: 10, description: "Happy Birthday!" },
  anniversary_reward: { enabled: false, points: 25, discount_percent: 5, description: "Thanks for being loyal!" },
  milestones: [],
};

export default function GroupDashboard() {
  const { user } = useAuth();
  const { group, groups, venues, isGroupAdmin, refetch } = useVenue();
  const groupVenues = venues.filter((v) => v.group_id === group?.id);

  /* ── No group: creation UI ── */
  if (!group) {
    return <CreateGroupPanel onCreated={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{group.name}</h2>
        <p className="text-muted-foreground">Parent Company — {groupVenues.length} venue{groupVenues.length !== 1 ? "s" : ""}</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview"><Building2 className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-3.5 w-3.5 mr-1" />Settings</TabsTrigger>
          <TabsTrigger value="venues"><Building2 className="h-3.5 w-3.5 mr-1" />Venues</TabsTrigger>
          <TabsTrigger value="loyalty"><Gift className="h-3.5 w-3.5 mr-1" />Loyalty</TabsTrigger>
          <TabsTrigger value="diners"><Users className="h-3.5 w-3.5 mr-1" />Diners</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab groupId={group.id} groupVenues={groupVenues} /></TabsContent>
        <TabsContent value="settings"><SettingsTab group={group} onSaved={refetch} /></TabsContent>
        <TabsContent value="venues"><VenuesTab group={group} allVenues={venues} groupVenues={groupVenues} onChanged={refetch} /></TabsContent>
        <TabsContent value="loyalty"><GroupLoyaltyTab group={group} /></TabsContent>
        <TabsContent value="diners"><GroupDinersTab group={group} groupVenues={groupVenues} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CREATE GROUP
   ═══════════════════════════════════════════ */
function CreateGroupPanel({ onCreated }: { onCreated: () => Promise<void> }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim() || !user) return;
    setCreating(true);
    const { data: groupRow, error } = await supabase
      .from("venue_groups")
      .insert({ name: name.trim() })
      .select()
      .single();
    if (error || !groupRow) {
      toast({ title: "Error", description: error?.message || "Failed to create group", variant: "destructive" });
      setCreating(false);
      return;
    }
    // Add self as group_admin
    await supabase.from("venue_group_staff").insert({
      group_id: groupRow.id,
      user_id: user.id,
      role: "group_admin" as any,
    });
    toast({ title: "Parent company created!" });
    await onCreated();
    setCreating(false);
  };

  return (
    <div className="flex items-center justify-center py-20">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Create a Parent Company</CardTitle>
          <CardDescription>Group multiple venues under one organisation to share loyalty programs and diner data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Company Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AVC Hospitality" className="mt-1" />
          </div>
          <Button onClick={create} disabled={!name.trim() || creating} className="w-full">
            {creating ? "Creating..." : "Create Parent Company"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════ */
function OverviewTab({ groupId, groupVenues }: { groupId: string; groupVenues: any[] }) {
  const [stats, setStats] = useState<Record<string, { orders: number; revenue: number }>>({});

  useEffect(() => {
    if (groupVenues.length === 0) return;
    const fetchAll = async () => {
      const results: Record<string, { orders: number; revenue: number }> = {};
      for (const v of groupVenues) {
        const { data } = await supabase.from("orders").select("id, total").eq("venue_id", v.id);
        const orders = data || [];
        results[v.id] = {
          orders: orders.length,
          revenue: orders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0),
        };
      }
      setStats(results);
    };
    fetchAll();
  }, [groupVenues.length]);

  const totalRevenue = Object.values(stats).reduce((s, v) => s + v.revenue, 0);
  const totalOrders = Object.values(stats).reduce((s, v) => s + v.orders, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Venues</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{groupVenues.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">${totalRevenue.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{totalOrders}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg / Venue</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ${groupVenues.length ? (totalRevenue / groupVenues.length).toFixed(2) : "0.00"}
            </div>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-lg font-semibold text-foreground">Venue Breakdown</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupVenues.map((v: any) => {
          const s = stats[v.id] || { orders: 0, revenue: 0 };
          return (
            <Card key={v.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{v.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{v.city}, {v.state}</p>
              </CardHeader>
              <CardContent className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.orders} orders</span>
                <span className="font-medium text-foreground">${s.revenue.toFixed(2)}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SETTINGS TAB
   ═══════════════════════════════════════════ */
function SettingsTab({ group, onSaved }: { group: any; onSaved: () => Promise<void> }) {
  const settings: GroupSettings = (group.settings && typeof group.settings === "object") ? group.settings : {};
  const [name, setName] = useState(group.name);
  const [globalDiners, setGlobalDiners] = useState(settings.global_diners ?? false);
  const [globalLoyalty, setGlobalLoyalty] = useState(settings.global_loyalty ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("venue_groups").update({
      name: name.trim(),
      settings: { ...settings, global_diners: globalDiners, global_loyalty: globalLoyalty },
    }).eq("id", group.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Settings saved" }); await onSaved(); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Company Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diner & Loyalty Settings</CardTitle>
          <CardDescription>Cross-venue behaviours that apply to every venue in this group.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Global Diner Recognition</p>
              <p className="text-xs text-muted-foreground">Diners signing up at one venue are recognised at every venue in this group — same profile, allergens and saved cards.</p>
            </div>
            <Switch checked={globalDiners} onCheckedChange={setGlobalDiners} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Global Loyalty Pooling</p>
              <p className="text-xs text-muted-foreground">Points earned at one venue can be redeemed at any sibling venue. Requires a group-level loyalty program.</p>
            </div>
            <Switch checked={globalLoyalty} onCheckedChange={setGlobalLoyalty} />
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            → Configure your loyalty program (H&L OrderNow Loyalty or your own custom programs) in the <strong>Loyalty</strong> tab.
          </p>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   VENUES TAB
   ═══════════════════════════════════════════ */
function VenuesTab({ group, allVenues, groupVenues, onChanged }: { group: any; allVenues: any[]; groupVenues: any[]; onChanged: () => Promise<void> }) {
  const [toggling, setToggling] = useState<string | null>(null);

  const toggleVenue = async (venueId: string, currentlyAssigned: boolean) => {
    setToggling(venueId);
    const { error } = await supabase.from("venues").update({
      group_id: currentlyAssigned ? null : group.id,
    }).eq("id", venueId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: currentlyAssigned ? "Venue removed from group" : "Venue added to group" }); await onChanged(); }
    setToggling(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Toggle venues to assign or remove them from <strong>{group.name}</strong>.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allVenues.map((v) => {
          const assigned = v.group_id === group.id;
          return (
            <Card key={v.id} className={assigned ? "border-primary/50" : ""}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-sm">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.city}{v.state ? `, ${v.state}` : ""} · {v.venue_type}</p>
                </div>
                <Switch
                  checked={assigned}
                  onCheckedChange={() => toggleVenue(v.id, assigned)}
                  disabled={toggling === v.id || (!!v.group_id && v.group_id !== group.id)}
                />
              </CardContent>
              {v.group_id && v.group_id !== group.id && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-muted-foreground">Assigned to another group</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GROUP LOYALTY TAB
   ═══════════════════════════════════════════ */
function GroupLoyaltyTab({ group }: { group: any }) {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", program_type: "points" });
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);

  const [shyndigActive, setShyndigActive] = useState(false);
  const [shyndigProgramId, setShyndigProgramId] = useState<string | null>(null);
  const [shyndigName, setShyndigName] = useState("H&L OrderNow Loyalty");
  const [editorOpen, setEditorOpen] = useState(false);

  const fetchPrograms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("group_id", group.id)
      .order("created_at");
    const all = (data || []).map((d: any) => ({ ...d, rules: (d.rules && typeof d.rules === "object" ? d.rules : {}) as LoyaltyRules }));
    const builtin = all.find((p: any) => p.is_ordrup_builtin);
    setShyndigActive(!!builtin?.is_active);
    setShyndigProgramId(builtin?.id ?? null);
    setShyndigName(builtin?.name || "H&L OrderNow Loyalty");
    // Custom programs only — never show the built-in row in the list (it's controlled by the card above).
    setPrograms(all.filter((p: any) => !p.is_ordrup_builtin));
    setLoading(false);
  };

  const toggleShyndigActive = async (next: boolean) => {
    if (!shyndigProgramId) {
      // No row yet — open the editor to create one.
      setEditorOpen(true);
      return;
    }
    const { error } = await supabase.from("loyalty_programs").update({ is_active: next }).eq("id", shyndigProgramId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setShyndigActive(next);
    toast({ title: next ? "H&L OrderNow Loyalty enabled" : "H&L OrderNow Loyalty paused" });
    fetchPrograms();
  };

  useEffect(() => { fetchPrograms(); }, [group.id]);

  const createProgram = async () => {
    if (!form.name.trim()) return;
    const { error } = await supabase.from("loyalty_programs").insert({
      group_id: group.id,
      name: form.name.trim(),
      program_type: form.program_type as any,
      rules: defaultRules as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Group loyalty program created" });
    setForm({ name: "", program_type: "points" });
    setDialogOpen(false);
    fetchPrograms();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("loyalty_programs").update({ is_active: !current }).eq("id", id);
    fetchPrograms();
  };

  const deleteProgram = async (id: string) => {
    await supabase.from("loyalty_programs").delete().eq("id", id);
    toast({ title: "Program deleted" });
    fetchPrograms();
  };

  return (
    <div className="space-y-6">
      {/* H&L OrderNow Loyalty (built-in) — top of Loyalty tab */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                H&L OrderNow Loyalty
                <Badge variant="outline" className="ml-1 text-[10px]">Built-in · Free</Badge>
              </CardTitle>
              <CardDescription>
                H&L OrderNow's free built-in loyalty program. When ON, this is the active program for diners — your custom programs below are paused.
              </CardDescription>
            </div>
            <Switch checked={shyndigActive} onCheckedChange={toggleShyndigActive} aria-label="Toggle H&L OrderNow Loyalty" />
          </div>
        </CardHeader>
        <CardContent>
          <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Configure Program
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Configure H&L OrderNow Loyalty</DialogTitle>
              </DialogHeader>
              <ShyndigLoyaltyEditor scope={{ type: "group", group_id: group.id }} defaultName="H&L OrderNow Loyalty" />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {shyndigActive && (
        <p className="text-xs text-muted-foreground italic px-1">
          H&L OrderNow Loyalty is your active program. Custom programs below are paused for diners.
        </p>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Custom Loyalty Programs</h3>
          <p className="text-sm text-muted-foreground">Your own programs (e.g. The Pass). Apply across all venues in this group.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> New Program</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Group Loyalty Program</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Program Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. The Pass" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.program_type} onValueChange={(v) => setForm({ ...form, program_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="points">Points</SelectItem>
                    <SelectItem value="stamps">Stamps</SelectItem>
                    <SelectItem value="tier">Tier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createProgram} className="w-full">Create Program</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No group loyalty programs yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => (
              <Card key={p.id} className={`cursor-pointer transition-all ${editingProgram?.id === p.id ? "ring-2 ring-primary" : "hover:border-primary/50"} ${shyndigActive ? "opacity-60" : ""}`} onClick={() => setEditingProgram(p)}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge variant={shyndigActive ? "outline" : (p.is_active ? "default" : "secondary")}>
                    {shyndigActive ? "Paused" : (p.is_active ? "Active" : "Inactive")}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Type: {p.program_type}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p.id, p.is_active)} onClick={(e) => e.stopPropagation()} />
                      <span className="text-xs text-muted-foreground">{p.is_active ? "Active" : "Paused"}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteProgram(p.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {editingProgram && (
            <GroupLoyaltyRulesEditor
              program={editingProgram}
              onSave={(updated) => { setEditingProgram(updated); fetchPrograms(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function GroupLoyaltyRulesEditor({ program, onSave }: { program: LoyaltyProgram; onSave: (p: LoyaltyProgram) => void }) {
  const [rules, setRules] = useState<LoyaltyRules>({ ...defaultRules, ...program.rules });
  const [saving, setSaving] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ threshold: 100, reward_type: "discount" as const, value: 10, description: "Milestone reward" });

  useEffect(() => { setRules({ ...defaultRules, ...program.rules }); }, [program.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("loyalty_programs").update({ rules: rules as any }).eq("id", program.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Rules saved" }); onSave({ ...program, rules }); }
    setSaving(false);
  };

  const addMilestone = () => {
    setRules((prev) => ({ ...prev, milestones: [...(prev.milestones || []), { ...newMilestone }] }));
    setNewMilestone({ threshold: (newMilestone.threshold || 100) + 100, reward_type: "discount", value: 10, description: "Milestone reward" });
  };

  const removeMilestone = (idx: number) => {
    setRules((prev) => ({ ...prev, milestones: (prev.milestones || []).filter((_, i) => i !== idx) }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <div>
          <CardTitle className="text-lg">Configure: {program.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Set up earning rates, bonuses, and milestone rewards</p>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="earning" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="earning"><DollarSign className="h-3.5 w-3.5 mr-1" />Earning</TabsTrigger>
            <TabsTrigger value="signup"><Sparkles className="h-3.5 w-3.5 mr-1" />Sign Up</TabsTrigger>
            <TabsTrigger value="occasions"><Cake className="h-3.5 w-3.5 mr-1" />Occasions</TabsTrigger>
            <TabsTrigger value="milestones"><Award className="h-3.5 w-3.5 mr-1" />Milestones</TabsTrigger>
          </TabsList>

          <TabsContent value="earning" className="space-y-4">
            <div className="space-y-2">
              <Label>Points earned per $1 spent</Label>
              <Input type="number" min={0} step={0.5} value={rules.points_per_dollar ?? 1} onChange={(e) => setRules({ ...rules, points_per_dollar: parseFloat(e.target.value) || 0 })} />
            </div>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <div className="space-y-2">
              <Label>Sign-up bonus points</Label>
              <Input type="number" min={0} value={rules.signup_bonus ?? 0} onChange={(e) => setRules({ ...rules, signup_bonus: parseInt(e.target.value) || 0 })} />
            </div>
          </TabsContent>

          <TabsContent value="occasions" className="space-y-6">
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Cake className="h-4 w-4 text-primary" /><Label className="text-base font-medium">Birthday Reward</Label></div>
                <Switch checked={rules.birthday_reward?.enabled ?? false} onCheckedChange={(enabled) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, enabled } })} />
              </div>
              {rules.birthday_reward?.enabled && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Bonus Points</Label><Input type="number" min={0} value={rules.birthday_reward?.points ?? 50} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, points: parseInt(e.target.value) || 0 } })} /></div>
                    <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} value={rules.birthday_reward?.discount_percent ?? 10} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, discount_percent: parseInt(e.target.value) || 0 } })} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={rules.birthday_reward?.description ?? ""} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, description: e.target.value } })} /></div>
                </div>
              )}
            </div>
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /><Label className="text-base font-medium">Anniversary Reward</Label></div>
                <Switch checked={rules.anniversary_reward?.enabled ?? false} onCheckedChange={(enabled) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, enabled } })} />
              </div>
              {rules.anniversary_reward?.enabled && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Bonus Points</Label><Input type="number" min={0} value={rules.anniversary_reward?.points ?? 25} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, points: parseInt(e.target.value) || 0 } })} /></div>
                    <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} value={rules.anniversary_reward?.discount_percent ?? 5} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, discount_percent: parseInt(e.target.value) || 0 } })} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={rules.anniversary_reward?.description ?? ""} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, description: e.target.value } })} /></div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="space-y-4">
            <p className="text-sm text-muted-foreground">Set rewards that unlock at spending or visit milestones.</p>
            {(rules.milestones || []).map((m, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex-1 grid grid-cols-4 gap-2 items-end">
                  <div><Label className="text-xs">Threshold</Label><Input type="number" value={m.threshold} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], threshold: parseInt(e.target.value) || 0 }; setRules({ ...rules, milestones: ms }); }} /></div>
                  <div><Label className="text-xs">Reward</Label>
                    <Select value={m.reward_type} onValueChange={(v) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], reward_type: v as any }; setRules({ ...rules, milestones: ms }); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="points">Bonus Points</SelectItem><SelectItem value="discount">Discount %</SelectItem><SelectItem value="free_item">Free Item</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Value</Label><Input type="number" value={m.value} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], value: parseInt(e.target.value) || 0 }; setRules({ ...rules, milestones: ms }); }} /></div>
                  <div><Label className="text-xs">Description</Label><Input value={m.description} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], description: e.target.value }; setRules({ ...rules, milestones: ms }); }} /></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeMilestone(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <Separator />
            <div className="p-3 rounded-lg border border-dashed border-border space-y-3">
              <p className="text-sm font-medium">Add Milestone</p>
              <div className="grid grid-cols-4 gap-2">
                <div><Label className="text-xs">Threshold</Label><Input type="number" value={newMilestone.threshold} onChange={(e) => setNewMilestone({ ...newMilestone, threshold: parseInt(e.target.value) || 0 })} /></div>
                <div><Label className="text-xs">Reward</Label>
                  <Select value={newMilestone.reward_type} onValueChange={(v) => setNewMilestone({ ...newMilestone, reward_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="points">Bonus Points</SelectItem><SelectItem value="discount">Discount %</SelectItem><SelectItem value="free_item">Free Item</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Value</Label><Input type="number" value={newMilestone.value} onChange={(e) => setNewMilestone({ ...newMilestone, value: parseInt(e.target.value) || 0 })} /></div>
                <div><Label className="text-xs">Description</Label><Input value={newMilestone.description} onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })} /></div>
              </div>
              <Button variant="outline" size="sm" onClick={addMilestone}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-6">
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Rules"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   GROUP DINERS TAB
   ═══════════════════════════════════════════ */
function GroupDinersTab({ group, groupVenues }: { group: any; groupVenues: any[] }) {
  const [diners, setDiners] = useState<DinerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (groupVenues.length === 0) { setDiners([]); setLoading(false); return; }
    const fetch = async () => {
      setLoading(true);
      const venueIds = groupVenues.map((v: any) => v.id);
      const { data: visits } = await supabase
        .from("diner_visits")
        .select("diner_id, visited_at")
        .in("venue_id", venueIds)
        .order("visited_at", { ascending: false });

      if (!visits || visits.length === 0) { setDiners([]); setLoading(false); return; }

      const dinerMap = new Map<string, { count: number; last: string }>();
      visits.forEach((v) => {
        const existing = dinerMap.get(v.diner_id);
        if (!existing) dinerMap.set(v.diner_id, { count: 1, last: v.visited_at });
        else existing.count++;
      });

      const dinerIds = Array.from(dinerMap.keys());
      const { data: profiles } = await supabase.from("diner_profiles").select("*").in("id", dinerIds);

      const result: DinerRow[] = (profiles || []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        phone: p.phone,
        allergens: p.allergens || [],
        visit_count: dinerMap.get(p.id)?.count || 0,
        last_visit: dinerMap.get(p.id)?.last || null,
      }));
      result.sort((a, b) => b.visit_count - a.visit_count);
      setDiners(result);
      setLoading(false);
    };
    fetch();
  }, [groupVenues.length]);

  const filtered = diners.filter((d) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (d.display_name || "").toLowerCase().includes(s) || (d.email || "").toLowerCase().includes(s) || (d.phone || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Group Diners</h3>
        <p className="text-sm text-muted-foreground">All diners across {groupVenues.length} venues.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search diners..." className="pl-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-muted-foreground">No diners found.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{d.display_name || "Anonymous"}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {d.email}</div>}
                {d.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {d.phone}</div>}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{d.visit_count} visits</span>
                  {d.last_visit && <span className="text-xs text-muted-foreground">Last: {new Date(d.last_visit).toLocaleDateString()}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
