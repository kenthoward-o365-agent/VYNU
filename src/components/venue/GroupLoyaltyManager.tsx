import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gift, Plus, Trash2, Star, Cake, Award, DollarSign, Sparkles, Settings2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ShyndigLoyaltyEditor from "@/components/venue/ShyndigLoyaltyEditor";
import { Separator } from "@/components/ui/separator";

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
}

const defaultRules: LoyaltyRules = {
  points_per_dollar: 1,
  signup_bonus: 0,
  birthday_reward: { enabled: false, points: 50, discount_percent: 10, description: "Happy Birthday! Enjoy a treat on us." },
  anniversary_reward: { enabled: false, points: 25, discount_percent: 5, description: "Thanks for being a loyal customer!" },
  milestones: [],
};

interface GroupLoyaltyManagerProps {
  groupId: string;
  groupName?: string;
}

export default function GroupLoyaltyManager({ groupId, groupName }: GroupLoyaltyManagerProps) {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [form, setForm] = useState({ name: "", program_type: "points" as string });

  const [shyndigActive, setShyndigActive] = useState(false);
  const [shyndigProgramId, setShyndigProgramId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const fetchPrograms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at");
    const all = (data || []).map((d: any) => ({ ...d, rules: (d.rules && typeof d.rules === "object" ? d.rules : {}) as LoyaltyRules }));
    const builtin = all.find((p: any) => p.is_ordrup_builtin);
    setShyndigActive(!!builtin?.is_active);
    setShyndigProgramId(builtin?.id ?? null);
    // Custom programs only.
    setPrograms(all.filter((p: any) => !p.is_ordrup_builtin));
    setLoading(false);
  };

  const toggleShyndigActive = async (next: boolean) => {
    if (!shyndigProgramId) { setEditorOpen(true); return; }
    const { error } = await supabase.from("loyalty_programs").update({ is_active: next }).eq("id", shyndigProgramId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: next ? "VYNU Loyalty enabled" : "VYNU Loyalty paused" });
    fetchPrograms();
  };

  useEffect(() => { fetchPrograms(); }, [groupId]);

  const createProgram = async () => {
    if (!form.name.trim()) return;
    const { error } = await supabase.from("loyalty_programs").insert({
      group_id: groupId,
      name: form.name.trim(),
      program_type: form.program_type as any,
      rules: defaultRules as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Global program created" });
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
    setEditingProgram(null);
    fetchPrograms();
  };

  const typeLabel = (t: string) => t === "points" ? "Points" : t === "stamps" ? "Stamps" : "Tier";

  return (
    <div className="space-y-6">
      {/* VYNU Loyalty (built-in, group-scoped) */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                VYNU Loyalty
                <Badge variant="outline" className="ml-1 text-[10px]">Built-in · Free</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                VYNU's free built-in loyalty program for {groupName || "this group"}. When ON, this becomes the active program for diners across every venue — your custom group programs below are paused.
              </p>
            </div>
            <Switch checked={shyndigActive} onCheckedChange={toggleShyndigActive} aria-label="Toggle VYNU Loyalty" />
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
              <DialogHeader><DialogTitle>Configure VYNU Loyalty</DialogTitle></DialogHeader>
              <ShyndigLoyaltyEditor scope={{ type: "group", group_id: groupId }} defaultName="VYNU Loyalty" />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {shyndigActive && (
        <p className="text-xs text-muted-foreground italic px-1">
          VYNU Loyalty is your active group program. Custom group programs below are paused for diners.
        </p>
      )}

      <Separator />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Custom Group Programs</p>
          </div>
          <p className="text-xs text-muted-foreground">
            These programs apply to <strong>all child venues</strong> under {groupName || "this group"}. Diners earn and redeem across every venue in the group.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Programs</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Global Program</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Global Loyalty Program</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Program Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Group Rewards Club" />
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
              <Button onClick={createProgram} className="w-full" disabled={!form.name.trim()}>Create Program</Button>
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
            <p className="text-muted-foreground">No global loyalty programs yet. Create one to reward diners across all venues.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => (
              <Card
                key={p.id}
                className={`cursor-pointer transition-all ${editingProgram?.id === p.id ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
                onClick={() => setEditingProgram(p)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Type: {typeLabel(p.program_type)}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_active ?? false} onCheckedChange={() => toggleActive(p.id, p.is_active)} onClick={(e) => e.stopPropagation()} />
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
            <GroupRulesEditor
              program={editingProgram}
              onSave={(updated) => {
                setEditingProgram(updated);
                fetchPrograms();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function GroupRulesEditor({ program, onSave }: { program: LoyaltyProgram; onSave: (p: LoyaltyProgram) => void }) {
  const [rules, setRules] = useState<LoyaltyRules>({ ...defaultRules, ...program.rules });
  const [saving, setSaving] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ threshold: 100, reward_type: "discount" as const, value: 10, description: "Milestone reward" });

  useEffect(() => { setRules({ ...defaultRules, ...program.rules }); }, [program.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("loyalty_programs").update({ rules: rules as any }).eq("id", program.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rules saved" });
      onSave({ ...program, rules });
    }
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
          <p className="text-sm text-muted-foreground">Set up earning rates, bonuses, and milestone rewards for all venues</p>
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
              <p className="text-xs text-muted-foreground">Applied across all child venues in the group</p>
            </div>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <div className="space-y-2">
              <Label>Sign-up bonus points</Label>
              <Input type="number" min={0} value={rules.signup_bonus ?? 0} onChange={(e) => setRules({ ...rules, signup_bonus: parseInt(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground">Points awarded when a diner joins the loyalty program at any venue</p>
            </div>
          </TabsContent>

          <TabsContent value="occasions" className="space-y-6">
            {/* Birthday */}
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cake className="h-4 w-4 text-primary" />
                  <Label className="text-base font-medium">Birthday Reward</Label>
                </div>
                <Switch checked={rules.birthday_reward?.enabled ?? false} onCheckedChange={(enabled) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, enabled } })} />
              </div>
              {rules.birthday_reward?.enabled && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Bonus Points</Label><Input type="number" min={0} value={rules.birthday_reward?.points ?? 50} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, points: parseInt(e.target.value) || 0 } })} /></div>
                    <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} value={rules.birthday_reward?.discount_percent ?? 10} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, discount_percent: parseInt(e.target.value) || 0 } })} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={rules.birthday_reward?.description ?? ""} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, description: e.target.value } })} placeholder="Happy Birthday! 🎂" /></div>
                </div>
              )}
            </div>

            {/* Anniversary */}
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  <Label className="text-base font-medium">Anniversary Reward</Label>
                </div>
                <Switch checked={rules.anniversary_reward?.enabled ?? false} onCheckedChange={(enabled) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, enabled } })} />
              </div>
              {rules.anniversary_reward?.enabled && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Bonus Points</Label><Input type="number" min={0} value={rules.anniversary_reward?.points ?? 25} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, points: parseInt(e.target.value) || 0 } })} /></div>
                    <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} value={rules.anniversary_reward?.discount_percent ?? 5} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, discount_percent: parseInt(e.target.value) || 0 } })} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={rules.anniversary_reward?.description ?? ""} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, description: e.target.value } })} placeholder="Thanks for being loyal! 🎉" /></div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="space-y-4">
            <p className="text-sm text-muted-foreground">Set rewards that unlock when diners hit spending or visit milestones across the group.</p>
            {(rules.milestones || []).map((m, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex-1 grid grid-cols-4 gap-2 items-end">
                  <div><Label className="text-xs">At {program.program_type === "points" ? "Points" : "Visits"}</Label><Input type="number" value={m.threshold} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], threshold: parseInt(e.target.value) || 0 }; setRules({ ...rules, milestones: ms }); }} /></div>
                  <div>
                    <Label className="text-xs">Reward</Label>
                    <Select value={m.reward_type} onValueChange={(v) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], reward_type: v as any }; setRules({ ...rules, milestones: ms }); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="points">Bonus Points</SelectItem>
                        <SelectItem value="discount">Discount %</SelectItem>
                        <SelectItem value="free_item">Free Item</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Value</Label><Input type="number" value={m.value} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], value: parseFloat(e.target.value) || 0 }; setRules({ ...rules, milestones: ms }); }} /></div>
                  <div><Label className="text-xs">Description</Label><Input value={m.description} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], description: e.target.value }; setRules({ ...rules, milestones: ms }); }} /></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeMilestone(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <div className="flex items-end gap-3 p-3 rounded-lg border border-dashed border-border">
              <div className="flex-1 grid grid-cols-4 gap-2 items-end">
                <div><Label className="text-xs">Threshold</Label><Input type="number" value={newMilestone.threshold} onChange={(e) => setNewMilestone({ ...newMilestone, threshold: parseInt(e.target.value) || 0 })} /></div>
                <div>
                  <Label className="text-xs">Reward</Label>
                  <Select value={newMilestone.reward_type} onValueChange={(v) => setNewMilestone({ ...newMilestone, reward_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="points">Bonus Points</SelectItem>
                      <SelectItem value="discount">Discount %</SelectItem>
                      <SelectItem value="free_item">Free Item</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Value</Label><Input type="number" value={newMilestone.value} onChange={(e) => setNewMilestone({ ...newMilestone, value: parseFloat(e.target.value) || 0 })} /></div>
                <div><Label className="text-xs">Description</Label><Input value={newMilestone.description} onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })} /></div>
              </div>
              <Button variant="outline" size="icon" onClick={addMilestone}><Plus className="h-4 w-4" /></Button>
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
