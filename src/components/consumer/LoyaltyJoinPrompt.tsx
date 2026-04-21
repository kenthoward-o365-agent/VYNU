import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Gift } from "lucide-react";
import { toast } from "sonner";

interface LoyaltyJoinPromptProps {
  venueId: string;
  groupId: string | null;
  /** When true, render the prompt (subject to internal eligibility checks). */
  show: boolean;
  /**
   * Diner profile id when signed in (Ordrup ID holder). When provided,
   * the prompt becomes a one-tap join (no signup form needed).
   */
  dinerId?: string | null;
  /**
   * Called when the diner needs to sign up first (guest flow).
   * Ignored when dinerId is set.
   */
  onJoin: () => void;
  onDismiss: () => void;
  /** Called after a successful one-tap enrolment. */
  onJoined?: (programName: string) => void;
}

interface LoyaltyProgramSummary {
  id: string;
  name: string;
  program_type: "points" | "stamps" | "tier";
  rules: any;
}

const DISMISS_KEY_PREFIX = "ordrup_loyalty_prompt_dismissed_";

const LoyaltyJoinPrompt = ({
  venueId,
  groupId,
  show,
  dinerId,
  onJoin,
  onDismiss,
  onJoined,
}: LoyaltyJoinPromptProps) => {
  const [program, setProgram] = useState<LoyaltyProgramSummary | null>(null);
  const [visible, setVisible] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (localStorage.getItem(DISMISS_KEY_PREFIX + venueId)) return;

    let cancelled = false;
    const fetchProgram = async () => {
      // Use the resolver so the right program (group > venue) is offered, respecting opt-outs.
      const { data: resolved } = await supabase
        .rpc("get_active_loyalty_program", { _venue_id: venueId });
      const chosen: any = Array.isArray(resolved) ? resolved[0] : resolved;
      if (cancelled || !chosen) return;

      // If signed in, skip if already enrolled in this program.
      if (dinerId) {
        const { data: existing } = await supabase
          .from("loyalty_balances")
          .select("id")
          .eq("diner_id", dinerId)
          .eq("program_id", chosen.id)
          .maybeSingle();
        if (existing) return;
      }

      setProgram({
        id: chosen.id,
        name: chosen.name,
        program_type: chosen.program_type,
        rules: chosen.rules,
      });
      setTimeout(() => setVisible(true), 600);
    };
    fetchProgram();
    return () => {
      cancelled = true;
    };
  }, [show, venueId, groupId, dinerId]);

  if (!show || !program || !visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY_PREFIX + venueId, "1");
    setVisible(false);
    onDismiss();
  };

  const handleOneTapJoin = async () => {
    if (!dinerId || !program) return;
    setJoining(true);
    try {
      const rules = program.rules && typeof program.rules === "object" ? program.rules : {};
      const signupBonus = (rules as any).signup_bonus || 0;
      const { error } = await supabase
        .from("loyalty_balances")
        .insert({ diner_id: dinerId, program_id: program.id, balance: signupBonus });
      if (error) throw error;
      toast.success(`You're in — welcome to ${program.name}! 🎉`);
      setVisible(false);
      onJoined?.(program.name);
    } catch (e: any) {
      console.error("One-tap loyalty join failed:", e);
      toast.error("Couldn't join just now. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const rewardCopy =
    program.program_type === "stamps"
      ? "Collect stamps every visit and unlock free items."
      : program.program_type === "tier"
        ? "Climb tiers for exclusive perks and priority service."
        : "Earn points on every order and redeem rewards.";

  const isOneTap = !!dinerId;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-xl p-6 m-0 sm:m-4 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Join {program.name}</h3>
              <p className="text-xs text-muted-foreground">
                {isOneTap ? "One tap with your Ordrup ID" : "Free rewards program"}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 -m-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <p className="text-sm text-foreground">{rewardCopy}</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{isOneTap ? "Instant enrolment — no forms" : "Get recognised every time you return"}</span>
            </li>
            <li className="flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{isOneTap ? "Rewards stack on top of your other Ordrup memberships" : "Faster checkout with saved details"}</span>
            </li>
            <li className="flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Personalised offers just for you</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          {isOneTap ? (
            <Button
              onClick={handleOneTapJoin}
              disabled={joining}
              className="w-full h-12 rounded-xl font-semibold"
            >
              {joining ? "Joining..." : `Join ${program.name} — one tap`}
            </Button>
          ) : (
            <Button onClick={onJoin} className="w-full h-12 rounded-xl font-semibold">
              Join now — it's free
            </Button>
          )}
          <Button
            onClick={handleDismiss}
            variant="ghost"
            className="w-full h-10 rounded-xl text-muted-foreground"
          >
            No thanks
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoyaltyJoinPrompt;
