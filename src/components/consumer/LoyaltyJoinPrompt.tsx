import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Gift } from "lucide-react";

interface LoyaltyJoinPromptProps {
  venueId: string;
  groupId: string | null;
  /** When true, the diner has just paid as a guest and we want to invite them to join. */
  show: boolean;
  onJoin: () => void;
  onDismiss: () => void;
}

interface LoyaltyProgramSummary {
  name: string;
  program_type: "points" | "stamps" | "tier";
}

/**
 * Post-checkout prompt inviting a guest diner to join the venue's (or group's)
 * loyalty program so they get rewards and are recognised on return visits.
 *
 * Renders nothing if:
 *  - `show` is false (e.g. diner is already signed in)
 *  - venue/group has no active loyalty program
 *  - the diner has previously dismissed this prompt for this venue
 */
const DISMISS_KEY_PREFIX = "ordrup_loyalty_prompt_dismissed_";

const LoyaltyJoinPrompt = ({
  venueId,
  groupId,
  show,
  onJoin,
  onDismiss,
}: LoyaltyJoinPromptProps) => {
  const [program, setProgram] = useState<LoyaltyProgramSummary | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;

    // Respect prior dismissal for this venue (per-device).
    if (localStorage.getItem(DISMISS_KEY_PREFIX + venueId)) return;

    let cancelled = false;
    const fetchProgram = async () => {
      // Prefer venue-specific program; fall back to group program.
      const filters: string[] = [`venue_id.eq.${venueId}`];
      if (groupId) filters.push(`group_id.eq.${groupId}`);

      const { data } = await supabase
        .from("loyalty_programs")
        .select("name, program_type, venue_id, group_id")
        .or(filters.join(","))
        .eq("is_active", true)
        .limit(5);

      if (cancelled || !data || data.length === 0) return;

      // Prefer venue-scoped over group-scoped.
      const venueScoped = data.find((p: any) => p.venue_id === venueId);
      const chosen = venueScoped || data[0];
      setProgram({ name: chosen.name, program_type: chosen.program_type });
      // Slight delay so it appears after the success animation, not at the same instant.
      setTimeout(() => setVisible(true), 600);
    };
    fetchProgram();
    return () => {
      cancelled = true;
    };
  }, [show, venueId, groupId]);

  if (!show || !program || !visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY_PREFIX + venueId, "1");
    setVisible(false);
    onDismiss();
  };

  const rewardCopy =
    program.program_type === "stamps"
      ? "Collect stamps every visit and unlock free items."
      : program.program_type === "tier"
        ? "Climb tiers for exclusive perks and priority service."
        : "Earn points on every order and redeem rewards.";

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
              <p className="text-xs text-muted-foreground">Free rewards program</p>
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
              <span>Get recognised every time you return</span>
            </li>
            <li className="flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Faster checkout with saved details</span>
            </li>
            <li className="flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Personalised offers just for you</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={onJoin} className="w-full h-12 rounded-xl font-semibold">
            Join now — it's free
          </Button>
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
