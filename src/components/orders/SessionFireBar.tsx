import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Users, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SessionInfo {
  id: string;
  status: string; // open | firing | closed
  display_name: string | null;
  diner_count: number;
  fire_strategy: string;
  fired_at: string | null;
  opened_at: string;
  table_number: string | null;
}

interface Props {
  session: SessionInfo;
  orderCount: number;
  itemCount: number;
  /** Seconds since the most recent order in this session was placed. Used to estimate when auto-fire happens. */
  secondsSinceLastOrder: number;
  /** Configured fire grace seconds for this venue. */
  fireGraceSeconds: number;
  canFire: boolean;
  onFired: () => void;
}

export default function SessionFireBar({
  session, orderCount, itemCount, secondsSinceLastOrder, fireGraceSeconds, canFire, onFired,
}: Props) {
  const isFired = !!session.fired_at;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isFired) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [isFired]);

  // Live-recompute remaining grace
  const elapsed = secondsSinceLastOrder + Math.floor((now - Date.now()) / 1000);
  const remaining = Math.max(0, fireGraceSeconds - elapsed);

  const fireNow = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("fire_table_session", { _session_id: session.id });
    setBusy(false);
    if (error || !data) { toast.error(error?.message || "Could not fire session"); return; }
    toast.success("Session fired — kitchen has the bundled ticket");
    onFired();
  };

  const closeSession = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("close_table_session", { _session_id: session.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Session closed");
    onFired();
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {session.table_number ? `Table ${session.table_number} · ` : ""}
              {session.display_name || "Group order"}
            </p>
            <p className="text-xs text-muted-foreground">
              {session.diner_count} diner{session.diner_count !== 1 ? "s" : ""} · {orderCount} order{orderCount !== 1 ? "s" : ""} · {itemCount} item{itemCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFired ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
              <Flame className="h-3 w-3 mr-1" /> Fired
            </Badge>
          ) : session.fire_strategy === "wait_for_all" ? (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              Fires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              {session.fire_strategy === "manual" ? "Manual fire" : "Per-course"}
            </Badge>
          )}
        </div>
      </div>

      {!isFired && canFire && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={fireNow} disabled={busy} className="gap-1">
            <Flame className="h-3.5 w-3.5" /> Fire now
          </Button>
          <Button size="sm" variant="outline" onClick={closeSession} disabled={busy} className="gap-1">
            <X className="h-3.5 w-3.5" /> Close session
          </Button>
        </div>
      )}
    </div>
  );
}
