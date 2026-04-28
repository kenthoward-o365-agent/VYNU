// Sectioned editor for Shyndig Loyalty programs (Toast-inspired).
// Used by both AdminVenueDetail (group programs on parent venues) and VenueSettings (solo venue programs).
// Loads/creates the canonical Shyndig Loyalty program for the given scope (group or venue),
// then exposes earn mechanic (points or stamps), redemption, signup bonus, status tiers,
// birthday reward, and milestones — all stored in `loyalty_programs.rules` JSONB.
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Sparkles, Cake, Award, Star, DollarSign, Stamp, Gift } from "lucide-react";
import { toast } from "sonner";

/* ── Canonical rules shape (Toast-inspired) ── */
type EarnMode = "points" | "stamps";
type StampTrigger = "visit" | "item";
type BirthdayType = "points" | "free_item" | "percent_discount";
type MilestoneRewardType = "discount_dollars" | "free_item" | "points";

interface TierLevel {
  name: string;
  threshold: number;
  earn_multiplier: number;
  perks?: string;
  color?: string;
}

interface Milestone {
  at_points: number;
  reward_type: MilestoneRewardType;
  value?: number;
  free_item_id?: string | null;
  label: string;
}

export interface ShyndigRules {
  earn?: {
    mode?: EarnMode;
    points_per_dollar?: number;
    stamp_trigger?: StampTrigger;
    stamps_required?: number;
    stamp_reward_item_id?: string | null;
  };
  redeem?: {
    rate_cents_per_point?: number;
    min_redeem_points?: number;
  };
  signup_bonus?: { enabled?: boolean; points?: number };
  tiers?: {
    enabled?: boolean;
    basis?: "rolling_12mo_spend";
    levels?: TierLevel[];
  };
  birthday_reward?: {
    enabled?: boolean;
    type?: BirthdayType;
    points?: number;
    free_item_id?: string | null;
    discount_percent?: number;
    valid_days?: number;
  };
  anniversary_reward?: { enabled?: boolean; type?: "points"; points?: number };
  milestones?: Milestone[];
  // Legacy fields preserved on save so we never drop existing config
  points_per_dollar?: number;
  signup_bonus_legacy?: number;
}

const DEFAULT_RULES: ShyndigRules = {
  earn: { mode: "points", points_per_dollar: 1, stamp_trigger: "visit", stamps_required: 10, stamp_reward_item_id: null },
  redeem: { rate_cents_per_point: 5, min_redeem_points: 100 },
  signup_bonus: { enabled: true, points: 50 },
  tiers: {
    enabled: false,
    basis: "rolling_12mo_spend",
    levels: [
      { name: "Bronze", threshold: 0, earn_multiplier: 1, perks: "1x points", color: "#CD7F32" },
      { name: "Silver", threshold: 500, earn_multiplier: 1.25, perks: "1.25x points + priority", color: "#C0C0C0" },
      { name: "Gold", threshold: 2000, earn_multiplier: 1.5, perks: "1.5x points + monthly treat", color: "#FFD700" },
    ],
  },
  birthday_reward: { enabled: false, type: "points", points: 100, discount_percent: 20, free_item_id: null, valid_days: 14 },
  anniversary_reward: { enabled: false, type: "points", points: 50 },
  milestones: [],
};

/** Migrate legacy rules shape (just `points_per_dollar` / old birthday_reward) into the new canonical shape, non-destructively. */
function migrateRules(raw: any): ShyndigRules {
  const r: ShyndigRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  if (!raw || typeof raw !== "object") return r;
  // earn
  if (raw.earn && typeof raw.earn === "object") {
    r.earn = { ...r.earn, ...raw.earn };
  } else if (typeof raw.points_per_dollar === "number") {
    r.earn!.points_per_dollar = raw.points_per_dollar;
  }
  // redeem
  if (raw.redeem) r.redeem = { ...r.redeem, ...raw.redeem };
  // signup
  if (raw.signup_bonus && typeof raw.signup_bonus === "object") {
    r.signup_bonus = { ...r.signup_bonus, ...raw.signup_bonus };
  } else if (typeof raw.signup_bonus === "number") {
    r.signup_bonus = { enabled: raw.signup_bonus > 0, points: raw.signup_bonus };
  }
  // tiers
  if (raw.tiers && typeof raw.tiers === "object") {
    r.tiers = {
      enabled: !!raw.tiers.enabled,
      basis: "rolling_12mo_spend",
      levels: Array.isArray(raw.tiers.levels) && raw.tiers.levels.length > 0 ? raw.tiers.levels : r.tiers!.levels,
    };
  }
  // birthday
  if (raw.birthday_reward && typeof raw.birthday_reward === "object") {
    r.birthday_reward = { ...r.birthday_reward, ...raw.birthday_reward };
    // Old shape used "discount_percent" + "points" without explicit type → default to points if not set
    if (!r.birthday_reward!.type) {
      r.birthday_reward!.type = (raw.birthday_reward.discount_percent && !raw.birthday_reward.points) ? "percent_discount" : "points";
    }
  }
  // anniversary
  if (raw.anniversary_reward && typeof raw.anniversary_reward === "object") {
    r.anniversary_reward = { ...r.anniversary_reward, ...raw.anniversary_reward };
  }
  // milestones — accept both new and legacy shapes
  if (Array.isArray(raw.milestones)) {
    r.milestones = raw.milestones.map((m: any): Milestone => {
      if (typeof m.at_points === "number") return m as Milestone;
      // Legacy: { threshold, reward_type: 'points'|'discount'|'free_item', value, description }
      const map: Record<string, MilestoneRewardType> = {
        points: "points",
        discount: "discount_dollars",
        free_item: "free_item",
      };
      return {
        at_points: Number(m.threshold) || 0,
        reward_type: map[m.reward_type] || "discount_dollars",
        value: Number(m.value) || 0,
        free_item_id: null,
        label: m.description || "Milestone reward",
      };
    });
  }
  return r;
}

interface ProgramRow {
  id: string;
  name: string;
  is_active: boolean;
  rules: any;
  group_id: string | null;
  venue_id: string | null;
}

interface ShyndigLoyaltyEditorProps {
  /** Either group_id (for group-scoped) or venue_id (for venue-scoped). Provide exactly one. */
  scope: { type: "group"; group_id: string } | { type: "venue"; venue_id: string };
  /** Venue id whose menu items to use as options for free-item rewards (group scope can pass any child venue). */
  menuVenueId?: string | null;
  /** Optional default name when no program exists yet. */
  defaultName?: string;
}

export default function ShyndigLoyaltyEditor({ scope, menuVenueId, defaultName = "Shyndig Loyalty" }: ShyndigLoyaltyEditorProps) {
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [name, setName] = useState(defaultName);
  const [isActive, setIsActive] = useState(true);
  const [rules, setRules] = useState<ShyndigRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuItems, setMenuItems] = useState<{ id: string; name: string }[]>([]);

  const scopeFilter = useMemo(() => {
    if (scope.type === "group") return { col: "group_id", val: scope.group_id };
    return { col: "venue_id", val: scope.venue_id };
  }, [scope]);

  useEffect(() => {
    void loadProgram();
    void loadMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFilter.col, scopeFilter.val, menuVenueId]);

  const loadProgram = async () => {
    setLoading(true);
    // Load ONLY the Shyndig built-in program for this scope.
    // Custom programs (The Pass, Morris House, etc.) live separately and are never touched here.
    let q = supabase
      .from("loyalty_programs")
      .select("id, name, is_active, rules, group_id, venue_id")
      .eq("is_shyndig_builtin", true)
      .limit(1);
    if (scope.type === "group") q = q.eq("group_id", scope.group_id).is("venue_id", null);
    else q = q.eq("venue_id", scope.venue_id).is("group_id", null);
    const { data } = await q.maybeSingle();
    if (data) {
      setProgram(data as ProgramRow);
      setName(data.name);
      setIsActive(!!data.is_active);
      setRules(migrateRules(data.rules));
    } else {
      setProgram(null);
      setName(defaultName);
      // Default OFF so it doesn't override custom programs until the operator deliberately turns it on.
      setIsActive(false);
      setRules(JSON.parse(JSON.stringify(DEFAULT_RULES)));
    }
    setLoading(false);
  };

  const loadMenuItems = async () => {
    const vid = menuVenueId ?? (scope.type === "venue" ? scope.venue_id : null);
    if (!vid) {
      setMenuItems([]);
      return;
    }
    const { data } = await supabase
      .from("menu_items")
      .select("id, name")
      .eq("venue_id", vid)
      .eq("is_available", true)
      .order("name");
    setMenuItems(data || []);
  };

  const save = async () => {
    setSaving(true);
    const trimmedName = name.trim() || defaultName;
    if (program) {
      const { error } = await supabase
        .from("loyalty_programs")
        .update({ name: trimmedName, is_active: isActive, rules: rules as any })
        .eq("id", program.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Shyndig Loyalty saved");
        await loadProgram();
      }
    } else {
      const insertRow: any = {
        name: trimmedName,
        is_active: isActive,
        rules: rules as any,
        program_type: "points",
        is_shyndig_builtin: true,
      };
      if (scope.type === "group") insertRow.group_id = scope.group_id;
      else insertRow.venue_id = scope.venue_id;
      const { error } = await supabase.from("loyalty_programs").insert(insertRow);
      if (error) toast.error(error.message);
      else {
        toast.success("Shyndig Loyalty created");
        await loadProgram();
      }
    }
    setSaving(false);
  };

  const setEarn = (patch: Partial<NonNullable<ShyndigRules["earn"]>>) =>
    setRules((r) => ({ ...r, earn: { ...r.earn, ...patch } }));
  const setRedeem = (patch: Partial<NonNullable<ShyndigRules["redeem"]>>) =>
    setRules((r) => ({ ...r, redeem: { ...r.redeem, ...patch } }));
  const setSignup = (patch: Partial<NonNullable<ShyndigRules["signup_bonus"]>>) =>
    setRules((r) => ({ ...r, signup_bonus: { ...r.signup_bonus, ...patch } }));
  const setTiers = (patch: Partial<NonNullable<ShyndigRules["tiers"]>>) =>
    setRules((r) => ({ ...r, tiers: { ...r.tiers, ...patch } as any }));
  const setBirthday = (patch: Partial<NonNullable<ShyndigRules["birthday_reward"]>>) =>
    setRules((r) => ({ ...r, birthday_reward: { ...r.birthday_reward, ...patch } }));

  const updateTierLevel = (idx: number, patch: Partial<TierLevel>) => {
    setRules((r) => {
      const levels = [...(r.tiers?.levels || [])];
      levels[idx] = { ...levels[idx], ...patch };
      return { ...r, tiers: { ...r.tiers, levels } as any };
    });
  };

  const removeTier = (idx: number) => {
    setRules((r) => ({ ...r, tiers: { ...r.tiers, levels: (r.tiers?.levels || []).filter((_, i) => i !== idx) } as any }));
  };

  const addTier = () => {
    setRules((r) => {
      const levels = [...(r.tiers?.levels || [])];
      const lastThreshold = levels.length ? Math.max(...levels.map((l) => l.threshold)) : 0;
      levels.push({ name: "New Tier", threshold: lastThreshold + 500, earn_multiplier: 1, perks: "", color: "#888888" });
      return { ...r, tiers: { ...r.tiers, levels } as any };
    });
  };

  const updateMilestone = (idx: number, patch: Partial<Milestone>) => {
    setRules((r) => {
      const milestones = [...(r.milestones || [])];
      milestones[idx] = { ...milestones[idx], ...patch };
      return { ...r, milestones };
    });
  };

  const removeMilestone = (idx: number) => {
    setRules((r) => ({ ...r, milestones: (r.milestones || []).filter((_, i) => i !== idx) }));
  };

  const addMilestone = () => {
    setRules((r) => {
      const milestones = [...(r.milestones || [])];
      const lastAt = milestones.length ? Math.max(...milestones.map((m) => m.at_points)) : 0;
      milestones.push({ at_points: lastAt + 250, reward_type: "discount_dollars", value: 5, label: "Milestone reward" });
      return { ...r, milestones };
    });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading Shyndig Loyalty…</p>;

  const earnMode = rules.earn?.mode ?? "points";

  return (
    <div className="space-y-6">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Program Identity
          </CardTitle>
          <CardDescription>The name diners see in their profile and on receipts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <Label className="text-xs">Program Name</Label>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="shyndig-active" />
              <Label htmlFor="shyndig-active" className="text-sm">Active</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earn mechanic */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />Earn Mechanic</CardTitle>
          <CardDescription>Choose how diners earn rewards: spend-based points or visit/item stamps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={earnMode} onValueChange={(v) => setEarn({ mode: v as EarnMode })} className="grid sm:grid-cols-2 gap-3">
            <Label htmlFor="earn-points" className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${earnMode === "points" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="points" id="earn-points" className="mt-1" />
              <div>
                <p className="text-sm font-medium">Points per dollar</p>
                <p className="text-xs text-muted-foreground">Diner earns points based on $ spent. Best for restaurants &amp; bars.</p>
              </div>
            </Label>
            <Label htmlFor="earn-stamps" className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${earnMode === "stamps" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="stamps" id="earn-stamps" className="mt-1" />
              <div>
                <p className="text-sm font-medium">Visit / item stamps</p>
                <p className="text-xs text-muted-foreground">"Buy 10, get 1 free." Best for cafés &amp; quick-service.</p>
              </div>
            </Label>
          </RadioGroup>

          {earnMode === "points" ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Points per $1 spent</Label>
                <Input type="number" min={0} step={0.5} value={rules.earn?.points_per_dollar ?? 1} onChange={(e) => setEarn({ points_per_dollar: parseFloat(e.target.value) || 0 })} className="mt-1" />
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Stamp trigger</Label>
                <Select value={rules.earn?.stamp_trigger ?? "visit"} onValueChange={(v) => setEarn({ stamp_trigger: v as StampTrigger })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visit">Per visit</SelectItem>
                    <SelectItem value="item">Per qualifying item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Stamps required</Label>
                <Input type="number" min={1} value={rules.earn?.stamps_required ?? 10} onChange={(e) => setEarn({ stamps_required: parseInt(e.target.value) || 10 })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Free item reward</Label>
                <Select value={rules.earn?.stamp_reward_item_id ?? "__none__"} onValueChange={(v) => setEarn({ stamp_reward_item_id: v === "__none__" ? null : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Choose an item —</SelectItem>
                    {menuItems.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Redemption */}
      {earnMode === "points" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gift className="h-4 w-4 text-primary" />Redemption</CardTitle>
            <CardDescription>Set how diners convert points back into discounts at checkout.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">100 points = $</Label>
              <Input
                type="number" min={0} step={0.5}
                value={((rules.redeem?.rate_cents_per_point ?? 5) * 100 / 100).toFixed(2)}
                onChange={(e) => setRedeem({ rate_cents_per_point: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">${(rules.redeem?.rate_cents_per_point ?? 5).toFixed(2)} value for every 100 points.</p>
            </div>
            <div>
              <Label className="text-xs">Minimum redemption (points)</Label>
              <Input type="number" min={0} value={rules.redeem?.min_redeem_points ?? 100} onChange={(e) => setRedeem({ min_redeem_points: parseInt(e.target.value) || 0 })} className="mt-1" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signup bonus */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Sign-up Bonus</CardTitle>
          <CardDescription>Reward diners with bonus points the moment they join.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Award points on signup</Label>
            <Switch checked={!!rules.signup_bonus?.enabled} onCheckedChange={(v) => setSignup({ enabled: v })} />
          </div>
          {rules.signup_bonus?.enabled && (
            <div>
              <Label className="text-xs">Points awarded</Label>
              <Input type="number" min={0} value={rules.signup_bonus?.points ?? 50} onChange={(e) => setSignup({ points: parseInt(e.target.value) || 0 })} className="mt-1 max-w-xs" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status tiers */}
      {earnMode === "points" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" />Status Tiers</CardTitle>
                <CardDescription>Tier badges based on rolling 12-month spend. Each tier multiplies points earned.</CardDescription>
              </div>
              <Switch checked={!!rules.tiers?.enabled} onCheckedChange={(v) => setTiers({ enabled: v })} />
            </div>
          </CardHeader>
          {rules.tiers?.enabled && (
            <CardContent className="space-y-3">
              {(rules.tiers.levels || []).map((lvl, idx) => (
                <div key={idx} className="grid grid-cols-[auto_1fr_1fr_1fr_2fr_auto] gap-2 items-end p-3 rounded-lg border border-border bg-muted/30">
                  <input
                    type="color"
                    value={lvl.color || "#888888"}
                    onChange={(e) => updateTierLevel(idx, { color: e.target.value })}
                    className="h-9 w-10 rounded border border-border cursor-pointer"
                    aria-label={`${lvl.name} colour`}
                  />
                  <div>
                    <Label className="text-[10px] uppercase">Name</Label>
                    <Input value={lvl.name} onChange={(e) => updateTierLevel(idx, { name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase">Spend ≥ $</Label>
                    <Input type="number" min={0} value={lvl.threshold} onChange={(e) => updateTierLevel(idx, { threshold: parseFloat(e.target.value) || 0 })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase">Earn ×</Label>
                    <Input type="number" min={0} step={0.05} value={lvl.earn_multiplier} onChange={(e) => updateTierLevel(idx, { earn_multiplier: parseFloat(e.target.value) || 1 })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase">Perks (display only)</Label>
                    <Input value={lvl.perks || ""} onChange={(e) => updateTierLevel(idx, { perks: e.target.value })} className="mt-1" />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTier(idx)} aria-label="Remove tier">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTier}><Plus className="h-3.5 w-3.5 mr-1" /> Add tier</Button>
              <p className="text-[11px] text-muted-foreground">Tiers are recomputed on every paid order based on the diner's spend over the last 12 months.</p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Birthday reward */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Cake className="h-4 w-4 text-primary" />Birthday Reward</CardTitle>
              <CardDescription>Surprise diners on their birthday with a treat valid for a few days.</CardDescription>
            </div>
            <Switch checked={!!rules.birthday_reward?.enabled} onCheckedChange={(v) => setBirthday({ enabled: v })} />
          </div>
        </CardHeader>
        {rules.birthday_reward?.enabled && (
          <CardContent className="space-y-4">
            <RadioGroup
              value={rules.birthday_reward?.type ?? "points"}
              onValueChange={(v) => setBirthday({ type: v as BirthdayType })}
              className="grid sm:grid-cols-3 gap-2"
            >
              {(["points", "free_item", "percent_discount"] as BirthdayType[]).map((t) => (
                <Label key={t} htmlFor={`bday-${t}`} className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer ${rules.birthday_reward?.type === t ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value={t} id={`bday-${t}`} />
                  <span className="text-sm">{t === "points" ? "Bonus points" : t === "free_item" ? "Free item" : "% discount"}</span>
                </Label>
              ))}
            </RadioGroup>

            <div className="grid sm:grid-cols-2 gap-3">
              {rules.birthday_reward?.type === "points" && (
                <div>
                  <Label className="text-xs">Bonus points</Label>
                  <Input type="number" min={0} value={rules.birthday_reward?.points ?? 100} onChange={(e) => setBirthday({ points: parseInt(e.target.value) || 0 })} className="mt-1" />
                </div>
              )}
              {rules.birthday_reward?.type === "free_item" && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Pick item</Label>
                  <Select value={rules.birthday_reward?.free_item_id ?? "__none__"} onValueChange={(v) => setBirthday({ free_item_id: v === "__none__" ? null : v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select an item" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Choose an item —</SelectItem>
                      {menuItems.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {rules.birthday_reward?.type === "percent_discount" && (
                <div>
                  <Label className="text-xs">Discount %</Label>
                  <Input type="number" min={0} max={100} value={rules.birthday_reward?.discount_percent ?? 20} onChange={(e) => setBirthday({ discount_percent: parseInt(e.target.value) || 0 })} className="mt-1" />
                </div>
              )}
              <div>
                <Label className="text-xs">Valid for (days after birthday)</Label>
                <Input type="number" min={1} max={60} value={rules.birthday_reward?.valid_days ?? 14} onChange={(e) => setBirthday({ valid_days: parseInt(e.target.value) || 14 })} className="mt-1" />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Milestones */}
      {earnMode === "points" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="h-4 w-4 text-primary" />Point Milestones</CardTitle>
            <CardDescription>Trigger one-off rewards when a diner crosses a points threshold.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(rules.milestones || []).length === 0 && (
              <p className="text-xs text-muted-foreground">No milestones yet.</p>
            )}
            {(rules.milestones || []).map((m, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2 items-end p-3 rounded-lg border border-border bg-muted/30">
                <div>
                  <Label className="text-[10px] uppercase">At points</Label>
                  <Input type="number" min={0} value={m.at_points} onChange={(e) => updateMilestone(idx, { at_points: parseInt(e.target.value) || 0 })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Reward</Label>
                  <Select value={m.reward_type} onValueChange={(v) => updateMilestone(idx, { reward_type: v as MilestoneRewardType })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discount_dollars">$ discount</SelectItem>
                      <SelectItem value="free_item">Free item</SelectItem>
                      <SelectItem value="points">Bonus points</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {m.reward_type === "free_item" ? (
                    <>
                      <Label className="text-[10px] uppercase">Item</Label>
                      <Select value={m.free_item_id ?? "__none__"} onValueChange={(v) => updateMilestone(idx, { free_item_id: v === "__none__" ? null : v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Pick item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Pick item —</SelectItem>
                          {menuItems.map((mi) => <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <>
                      <Label className="text-[10px] uppercase">{m.reward_type === "discount_dollars" ? "$ value" : "Points"}</Label>
                      <Input type="number" min={0} value={m.value ?? 0} onChange={(e) => updateMilestone(idx, { value: parseFloat(e.target.value) || 0 })} className="mt-1" />
                    </>
                  )}
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Label</Label>
                  <Input value={m.label} onChange={(e) => updateMilestone(idx, { label: e.target.value })} className="mt-1" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeMilestone(idx)} aria-label="Remove milestone">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addMilestone}><Plus className="h-3.5 w-3.5 mr-1" /> Add milestone</Button>
          </CardContent>
        </Card>
      )}

      <Separator />
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {program ? <>Editing existing program · ID <code className="text-[10px]">{program.id.slice(0, 8)}…</code></> : "No program yet — saving will create one."}
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : program ? "Save Program" : "Create Program"}
        </Button>
      </div>
    </div>
  );
}
