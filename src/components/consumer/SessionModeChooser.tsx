import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, User, Sparkles, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SessionMode = "solo" | "group";

export interface OpenSession {
  id: string;
  display_name: string | null;
  diner_count: number;
  opened_at: string;
  fire_strategy: string;
  host_first_name: string | null;
}

interface SessionModeChooserProps {
  venueId: string;
  tableId: string;
  tableNumber: string;
  onSelect: (mode: SessionMode, sessionId?: string, displayName?: string) => void;
}

const SessionModeChooser = ({ venueId, tableId, tableNumber, onSelect }: SessionModeChooserProps) => {
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([]);
  const [showStartGroup, setShowStartGroup] = useState(false);
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.rpc("list_open_sessions_at_table", {
        _venue_id: venueId,
        _table_id: tableId,
      });
      if (!cancelled && data) setOpenSessions(data as OpenSession[]);
    };

    load();

    // Realtime: refresh when a session at this table changes
    const channel = supabase
      .channel(`table-sessions-${tableId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "table_sessions", filter: `table_id=eq.${tableId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [venueId, tableId]);

  const hasOpen = openSessions.length > 0;

  return (
    <div className="px-6 py-6">
      <div className="max-w-xs mx-auto space-y-3">
        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Table {tableNumber}
          </p>
          <h2 className="text-lg font-semibold">How are you ordering?</h2>
        </div>

        {/* Existing groups to join */}
        {hasOpen &&
          openSessions.map((s) => {
            const label =
              s.display_name ||
              (s.host_first_name ? `${s.host_first_name}'s group` : "Group order");
            return (
              <button
                key={s.id}
                onClick={() => onSelect("group", s.id)}
                className={cn(
                  "w-full p-4 rounded-2xl border-2 border-primary/40 bg-primary/5 text-left",
                  "hover:bg-primary/10 transition-colors flex items-center gap-3"
                )}
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">Join {label}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.diner_count} {s.diner_count === 1 ? "person" : "people"} ordering together
                  </p>
                </div>
              </button>
            );
          })}

        {/* Solo */}
        <Button
          onClick={() => onSelect("solo")}
          size="lg"
          className="w-full h-14 rounded-2xl text-sm justify-start gap-3 px-4"
        >
          <User className="h-5 w-5" />
          <div className="text-left flex-1">
            <div className="font-semibold">Order on my own</div>
            <div className="text-[11px] opacity-80 font-normal">Fires to kitchen immediately</div>
          </div>
        </Button>

        {/* Start a group (or fresh group when one exists) */}
        {!showStartGroup ? (
          <Button
            variant="outline"
            onClick={() => setShowStartGroup(true)}
            className="w-full h-14 rounded-2xl text-sm justify-start gap-3 px-4 border-primary/30 hover:bg-primary/10"
          >
            {hasOpen ? <Plus className="h-5 w-5 text-primary" /> : <Sparkles className="h-5 w-5 text-primary" />}
            <div className="text-left flex-1">
              <div className="font-semibold">{hasOpen ? "Start a fresh group" : "Start a group order"}</div>
              <div className="text-[11px] opacity-70 font-normal">
                Bundle the table — food fires together
              </div>
            </div>
          </Button>
        ) : (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold mb-1">Name your group (optional)</p>
              <p className="text-xs text-muted-foreground">e.g. "Sarah's birthday"</p>
            </div>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              maxLength={40}
              className="rounded-xl"
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowStartGroup(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onSelect("group", undefined, groupName.trim() || undefined)}
              >
                Start group
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionModeChooser;
