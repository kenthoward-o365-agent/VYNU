import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Beer, Coins, Gift, Plus, Trash2, Users, Store } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface PubPlusDeal {
  title: string;
  description: string;
}

export interface PubPlusRules {
  program: "pubplus";
  scope: "group";
  shared_across_venues: true;
  points_per_dollar: number;
  earn: { mode: "points"; points_per_dollar: number };
  coin: { threshold_points: number; value_dollars: number };
  signup_bonus: number;
  milestones: {
    at_points: number;
    reward_type: "discount_dollars";
    value: number;
    label: string;
  }[];
  member_deals: PubPlusDeal[];
}

export const PUBPLUS_NAME = "Pub+";

export function buildPubPlusRules(
  pointsPerDollar: number,
  coinThreshold: number,
  coinValue: number,
  signupBonusPoints: number,
  deals: PubPlusDeal[],
): PubPlusRules {
  return {
    program: "pubplus",
    scope: "group",
    shared_across_venues: true,
    points_per_dollar: pointsPerDollar,
    earn: { mode: "points", points_per_dollar: pointsPerDollar },
    coin: { threshold_points: coinThreshold, value_dollars: coinValue },
    signup_bonus: signupBonusPoints,
    milestones: [
      {
        at_points: coinThreshold,
        reward_type: "discount_dollars",
        value: coinValue,
        label: `pub+ coin — $${coinValue} to spend`,
      },
    ],
    member_deals: deals,
  };
}

const DEFAULT_DEALS: PubPlusDeal[] = [
  { title: "Member pricing", description: "Exclusive member prices on selected food and drinks." },
  { title: "Birthday treat", description: "A little something on us during your birthday month." },
];

interface Props {
  groupId: string;
  groupName: string;
  venueCount: number;
}

export default function PubPlusManager({ groupId, groupName, venueCount }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [programId, setProgramId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const [pointsPerDollar, setPointsPerDollar] = useState(1);
  const [coinThreshold, setCoinThreshold] = useState(200);
  const [coinValue, setCoinValue] = useState(10);
  const [signupBonus, setSignupBonus] = useState(200);
  const [deals, setDeals] = useState<PubPlusDeal[]>(DEFAULT_DEALS);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("group_id", groupId)
      .eq("is_pubplus", true)
      .maybeSingle();

    if (data) {
      const r = ((data.rules && typeof data.rules === "object" ? data.rules : {}) as Partial<PubPlusRules>);
      setProgramId(data.id);
      setIsActive(!!data.is_active);
      setPointsPerDollar(Number(r.points_per_dollar ?? 1));
      setCoinThreshold(Number(r.coin?.threshold_points ?? 200));
      setCoinValue(Number(r.coin?.value_dollars ?? 10));
      setSignupBonus(Number(r.signup_bonus ?? 200));
      setDeals(Array.isArray(r.member_deals) && r.member_deals.length ? r.member_deals : DEFAULT_DEALS);

      const { count } = await supabase
        .from("loyalty_balances")
        .select("id", { count: "exact", head: true })
        .eq("program_id", data.id);
      setMemberCount(count ?? 0);
    } else {
      setProgramId(null);
      setIsActive(false);
      setMemberCount(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (groupId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const persist = async (active: boolean) => {
    setSaving(true);
    const rules = buildPubPlusRules(pointsPerDollar, coinThreshold, coinValue, signupBonus, deals);
    if (programId) {
      const { error } = await supabase
        .from("loyalty_programs")
        .update({ name: PUBPLUS_NAME, rules: rules as any, is_active: active })
        .eq("id", programId);
      setSaving(false);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("loyalty_programs")
        .insert({
          name: PUBPLUS_NAME,
          group_id: groupId,
          venue_id: null,
          program_type: "points",
          is_active: active,
          is_pubplus: true,
          rules: rules as any,
        })
        .select("id")
        .single();
      setSaving(false);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      setProgramId(data.id);
    }
    setIsActive(active);
    toast({ title: active ? "Pub+ is live across all venues" : "Pub+ paused" });
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Beer className="h-5 w-5 text-primary" />
                Pub+
                {isActive && <Badge className="ml-1">Live</Badge>}
              </CardTitle>
              <CardDescription>
                Get more out of your local. One shared program for {groupName} — members earn and
                redeem at every venue in the group, no matter where they joined.
              </CardDescription>
            </div>
            <Switch
              checked={isActive}
              disabled={saving}
              onCheckedChange={(v) => persist(v)}
              aria-label="Toggle Pub+"
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Store className="h-4 w-4 text-primary" /> Venues included
            </div>
            <p className="text-2xl font-bold mt-1">{venueCount}</p>
            <p className="text-xs text-muted-foreground">Every child venue, automatically</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-primary" /> Members
            </div>
            <p className="text-2xl font-bold mt-1">{memberCount ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Shared across the group</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Coins className="h-4 w-4 text-primary" /> Coin
            </div>
            <p className="text-2xl font-bold mt-1">{coinThreshold} pts</p>
            <p className="text-xs text-muted-foreground">Unlocks ${coinValue} to spend</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Earn · Unlock · Reward</CardTitle>
          <CardDescription>
            Earn points on every visit, reach {coinThreshold} points to unlock a pub+ coin, and get
            rewarded with member deals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Points per $1 spent</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={pointsPerDollar}
                onChange={(e) => setPointsPerDollar(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Welcome bonus (points on join)</Label>
              <Input
                type="number"
                min={0}
                value={signupBonus}
                onChange={(e) => setSignupBonus(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {signupBonus} points ≈ ${((signupBonus / Math.max(coinThreshold, 1)) * coinValue).toFixed(2)} in rewards
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Points to unlock a pub+ coin</Label>
              <Input
                type="number"
                min={1}
                value={coinThreshold}
                onChange={(e) => setCoinThreshold(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coin value ($)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={coinValue}
                onChange={(e) => setCoinValue(Number(e.target.value))}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-primary" /> Member deals &amp; offers
                </Label>
                <p className="text-xs text-muted-foreground">Shown to Pub+ members at every venue.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeals((d) => [...d, { title: "", description: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add deal
              </Button>
            </div>
            {deals.map((deal, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Deal title"
                    value={deal.title}
                    onChange={(e) =>
                      setDeals((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeals((d) => d.filter((_, j) => j !== i))}
                    aria-label="Remove deal"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Description"
                  value={deal.description}
                  onChange={(e) =>
                    setDeals((d) => d.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={() => persist(isActive)} disabled={saving}>
              {saving ? "Saving…" : programId ? "Save Pub+" : "Create Pub+"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How sharing works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>• Turning Pub+ on here enables it at every venue in {groupName} — venues cannot opt out.</p>
          <p>• Pub+ takes priority over any other group or venue-level loyalty program.</p>
          <p>• One member balance per diner, earned and redeemed at any venue in the group.</p>
        </CardContent>
      </Card>
    </div>
  );
}
