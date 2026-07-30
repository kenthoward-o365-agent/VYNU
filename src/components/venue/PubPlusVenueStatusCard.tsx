import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Beer, Coins, Lock, Users } from "lucide-react";
import { isPubPlusProgram, pubPlusCopy, type PubPlusCopy } from "@/lib/pubplus";

/**
 * Read-only Pub+ status for a child venue. Pub+ is owned by the parent group —
 * venues can see what their diners see but cannot change or disable it here.
 */
export default function PubPlusVenueStatusCard({
  venueId,
  groupId,
}: {
  venueId: string;
  groupId: string | null | undefined;
}) {
  const [program, setProgram] = useState<{ id: string; name: string; copy: PubPlusCopy } | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    if (!groupId) { setProgram(null); return; }
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("loyalty_programs")
        .select("id, name, rules, is_pubplus, is_active")
        .eq("group_id", groupId)
        .eq("is_pubplus", true)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled || !data || !isPubPlusProgram(data as any)) { setProgram(null); return; }
      setProgram({ id: data.id, name: data.name, copy: pubPlusCopy(data.rules) });

      const { count } = await supabase
        .from("loyalty_balances")
        .select("id", { count: "exact", head: true })
        .eq("program_id", data.id);
      if (!cancelled) setMemberCount(count ?? null);
    })();

    return () => { cancelled = true; };
  }, [groupId, venueId]);

  if (!program) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Beer className="h-4 w-4 text-primary" />
              {program.name}
              <Badge variant="outline" className="ml-1 text-[10px]">Group-managed</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Run by your parent company for every venue in the group. Diners join from the QR ordering
              app by signing in — no app download and no barcode scan.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Earn rate</p>
            <p className="text-sm font-semibold text-foreground">
              {program.copy.pointsPerDollar} pt{program.copy.pointsPerDollar === 1 ? "" : "s"} per $1
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Coins className="h-3 w-3" /> pub+ coin
            </p>
            <p className="text-sm font-semibold text-foreground">
              {program.copy.coinThreshold} pts → ${program.copy.coinValue}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Members (group-wide)
            </p>
            <p className="text-sm font-semibold text-foreground">
              {memberCount === null ? "—" : memberCount.toLocaleString()}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          This program can't be changed or switched off at venue level — points earned here are
          redeemable at any venue in the group.
        </p>
      </CardContent>
    </Card>
  );
}
