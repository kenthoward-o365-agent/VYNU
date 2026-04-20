import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Users, Clock, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TableSessionConfig {
  enabled: boolean;
  join_window_minutes: number;
  idle_close_minutes: number;
  max_session_minutes: number;
  default_fire_strategy: "wait_for_all" | "fire_per_course" | "manual";
  fire_grace_seconds: number;
}

const defaults: TableSessionConfig = {
  enabled: true,
  join_window_minutes: 15,
  idle_close_minutes: 20,
  max_session_minutes: 120,
  default_fire_strategy: "wait_for_all",
  fire_grace_seconds: 90,
};

export default function TableSessionsSettingsTab({ venueId }: { venueId: string }) {
  const [config, setConfig] = useState<TableSessionConfig>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("venues").select("settings").eq("id", venueId).single();
      const existing = (data?.settings as any)?.table_session as Partial<TableSessionConfig> | undefined;
      if (existing) setConfig({ ...defaults, ...existing });
      setLoaded(true);
    })();
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    const { data: current } = await supabase.from("venues").select("settings").eq("id", venueId).single();
    const merged = { ...((current?.settings as any) || {}), table_session: config };
    const { error } = await supabase.from("venues").update({ settings: merged }).eq("id", venueId);
    if (error) toast.error(error.message);
    else toast.success("Table session settings saved");
    setSaving(false);
  };

  if (!loaded) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Table Sessions & Group Ordering
              </CardTitle>
              <CardDescription>
                Allow multiple diners scanning the same table QR to bundle their orders into one kitchen ticket so food fires together.
              </CardDescription>
            </div>
            <Switch checked={config.enabled} onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))} />
          </div>
        </CardHeader>
        {config.enabled && (
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Join window (minutes)
                </Label>
                <Input
                  type="number" min={1} max={120}
                  value={config.join_window_minutes}
                  onChange={(e) => setConfig((c) => ({ ...c, join_window_minutes: Math.max(1, Number(e.target.value) || 1) }))}
                />
                <p className="text-xs text-muted-foreground">Diners who scan within this window can join the same group session.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Idle close (minutes)
                </Label>
                <Input
                  type="number" min={1} max={240}
                  value={config.idle_close_minutes}
                  onChange={(e) => setConfig((c) => ({ ...c, idle_close_minutes: Math.max(1, Number(e.target.value) || 1) }))}
                />
                <p className="text-xs text-muted-foreground">Auto-close a session after this much inactivity.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Max session length (minutes)
                </Label>
                <Input
                  type="number" min={30} max={480}
                  value={config.max_session_minutes}
                  onChange={(e) => setConfig((c) => ({ ...c, max_session_minutes: Math.max(30, Number(e.target.value) || 30) }))}
                />
                <p className="text-xs text-muted-foreground">Hard ceiling — no session lives longer than this.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5" /> Fire grace (seconds)
                </Label>
                <Input
                  type="number" min={10} max={600}
                  value={config.fire_grace_seconds}
                  onChange={(e) => setConfig((c) => ({ ...c, fire_grace_seconds: Math.max(10, Number(e.target.value) || 10) }))}
                />
                <p className="text-xs text-muted-foreground">After the last order in a group, wait this long then auto-fire to kitchen.</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Default fire strategy</Label>
              <Select
                value={config.default_fire_strategy}
                onValueChange={(v: any) => setConfig((c) => ({ ...c, default_fire_strategy: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wait_for_all">Wait for all — bundle orders, fire together (recommended)</SelectItem>
                  <SelectItem value="fire_per_course">Fire per course — orders fire immediately, still grouped on screen</SelectItem>
                  <SelectItem value="manual">Manual — staff must press Fire</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Each new group session uses this strategy. You can override per-session from the Orders dashboard.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">In plain English:</p>
              <p className="text-muted-foreground">
                Diners who scan within <strong>{config.join_window_minutes} min</strong> can join a group.
                Kitchen waits <strong>{config.fire_grace_seconds}s</strong> after the last order, then fires the whole table together.
                Sessions auto-close after <strong>{config.idle_close_minutes} min</strong> idle (or <strong>{config.max_session_minutes} min</strong> total).
              </p>
            </div>

            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Table Session Settings"}</Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
