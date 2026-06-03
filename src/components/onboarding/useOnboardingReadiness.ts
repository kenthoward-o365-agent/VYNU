import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StageStatus = "done" | "in_progress" | "todo" | "n_a";

export interface ReadinessStage {
  id: string;
  title: string;
  blocker: boolean;
  status: StageStatus;
  detail: string;
  deep_link?: string;
}

export interface ReadinessResult {
  venue_id: string;
  stages: ReadinessStage[];
  blockers_total: number;
  blockers_done: number;
  score: number;
  ready_to_go_live: boolean;
  is_live: boolean;
  status: "in_progress" | "completed" | "dismissed";
  pos_choice: string | null;
}

export function useOnboardingReadiness(venueId: string | undefined) {
  const [data, setData] = useState<ReadinessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-readiness", {
        body: { venue_id: venueId },
      });
      if (error) throw error;
      setData(data as ReadinessResult);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load readiness");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh, setData };
}
