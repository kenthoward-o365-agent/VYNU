import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Award, Cake, DollarSign, Gift, Settings2, Sparkles, Star } from "lucide-react";

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

const typeLabel = (t: string) => (t === "points" ? "Points" : t === "stamps" ? "Stamps" : "Tier");

interface ChildVenueLoyaltyViewerProps {
  groupId: string;
  venueName?: string;
}

export default function ChildVenueLoyaltyViewer({ groupId, venueName }: ChildVenueLoyaltyViewerProps) {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrograms = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loyalty_programs")
        .select("*")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("created_at");

      setPrograms(
        (data || [])
          .filter((p: any) => !p.is_ordrup_builtin)
          .map((program: any) => ({
            ...program,
            rules: (program.rules && typeof program.rules === "object" ? program.rules : {}) as LoyaltyRules,
          }))
      );
      setLoading(false);
    };

    fetchPrograms();
  }, [groupId]);

  const expandedProgram = programs.find((program) => program.id === expandedProgramId) ?? null;

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Inherited Group Loyalty</p>
            <Badge variant="outline" className="text-xs">Read-only</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Active group programs automatically apply to {venueName || "this venue"}. They are managed at the parent venue level and cannot be edited here.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Gift className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No active inherited group loyalty programs.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <Card
                key={program.id}
                className={`cursor-pointer transition-all border-primary/20 bg-primary/5 ${expandedProgramId === program.id ? "ring-2 ring-primary" : "hover:border-primary/40"}`}
                onClick={() => setExpandedProgramId(expandedProgramId === program.id ? null : program.id)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{program.name}</CardTitle>
                  <Badge variant="default">Active</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">Type: {typeLabel(program.program_type)}</p>
                  <p className="text-xs text-muted-foreground italic">Managed by parent venue</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {expandedProgram && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">{expandedProgram.name} — Rules</CardTitle>
                  <p className="text-sm text-muted-foreground">Read-only view of inherited group settings</p>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const rules: LoyaltyRules = { ...defaultRules, ...expandedProgram.rules };

                  return (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                          <div className="flex items-center gap-1.5 text-sm font-medium"><DollarSign className="h-3.5 w-3.5 text-primary" />Earning Rate</div>
                          <p className="text-sm text-muted-foreground">{rules.points_per_dollar ?? 1} point(s) per $1 spent</p>
                        </div>
                        <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                          <div className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="h-3.5 w-3.5 text-primary" />Sign-up Bonus</div>
                          <p className="text-sm text-muted-foreground">{rules.signup_bonus ?? 0} points</p>
                        </div>
                        {rules.birthday_reward?.enabled && (
                          <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                            <div className="flex items-center gap-1.5 text-sm font-medium"><Cake className="h-3.5 w-3.5 text-primary" />Birthday Reward</div>
                            <p className="text-sm text-muted-foreground">{rules.birthday_reward.points} pts, {rules.birthday_reward.discount_percent}% off</p>
                            {rules.birthday_reward.description && <p className="text-xs text-muted-foreground italic">{rules.birthday_reward.description}</p>}
                          </div>
                        )}
                        {rules.anniversary_reward?.enabled && (
                          <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                            <div className="flex items-center gap-1.5 text-sm font-medium"><Star className="h-3.5 w-3.5 text-primary" />Anniversary Reward</div>
                            <p className="text-sm text-muted-foreground">{rules.anniversary_reward.points} pts, {rules.anniversary_reward.discount_percent}% off</p>
                            {rules.anniversary_reward.description && <p className="text-xs text-muted-foreground italic">{rules.anniversary_reward.description}</p>}
                          </div>
                        )}
                      </div>

                      {(rules.milestones || []).length > 0 && (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center gap-1.5 text-sm font-medium"><Award className="h-3.5 w-3.5 text-primary" />Milestones</div>
                          {rules.milestones!.map((milestone, idx) => (
                            <div key={idx} className="text-sm text-muted-foreground p-2 rounded border border-border bg-background">
                              At {milestone.threshold} → {milestone.reward_type === "points" ? `${milestone.value} bonus pts` : milestone.reward_type === "discount" ? `${milestone.value}% off` : "Free item"} — {milestone.description}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Separator />
    </div>
  );
}
