import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Activity, Pause, Sliders, Beaker, ArrowUp, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Area {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  color: string;
  display_order: number;
  is_active: boolean;
  throttle_enabled: boolean;
  throttle_mode: "open" | "auto" | "block" | "test";
  throttle_max_orders: number;
  throttle_window_minutes: number;
  throttle_block_timeout_minutes: number;
  throttle_block_until: string | null;
  throttle_show_wait_to_diner: boolean;
  base_prep_time_minutes: number;
}

interface QueuedOrder {
  id: string;
  throttled_until: string | null;
  created_at: string;
  total: number;
  extra_wait_minutes: number;
}

const MODE_META = {
  open:  { label: "Open",    icon: Activity, color: "bg-emerald-500", help: "Orders flow straight through to the station." },
  auto:  { label: "Auto",    icon: Sliders,  color: "bg-amber-500",   help: "System paces orders to the station's capacity." },
  block: { label: "Blocked", icon: Pause,    color: "bg-destructive", help: "All new orders held; auto-reverts to Auto after timeout." },
  test:  { label: "Test",    icon: Beaker,   color: "bg-blue-500",    help: "Logs throttling but releases orders immediately." },
} as const;

export default function OrderThrottling() {
  const { venue } = useVenue();
  const [areas, setAreas] = useState<Area[]>([]);
  const [queues, setQueues] = useState<Record<string, QueuedOrder[]>>({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Partial<Area>>>({});

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data: a } = await supabase
      .from("venue_display_areas")
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("display_order");
    setAreas((a as Area[]) ?? []);

    // queue per area (approx — orders with throttled_until>now for the venue)
    const { data: orders } = await supabase
      .from("orders")
      .select("id, throttled_until, created_at, total, extra_wait_minutes")
      .eq("venue_id", venue.id)
      .not("throttled_until", "is", null)
      .gt("throttled_until", new Date().toISOString())
      .order("throttled_until", { ascending: true });

    const byArea: Record<string, QueuedOrder[]> = {};
    for (const ar of (a as Area[]) ?? []) byArea[ar.id] = (orders as QueuedOrder[]) ?? [];
    setQueues(byArea);
    setLoading(false);
  };

  useEffect(() => { load(); }, [venue?.id]);

  useEffect(() => {
    if (!venue) return;
    const ch = supabase
      .channel(`throttling-${venue.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_display_areas", filter: `venue_id=eq.${venue.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venue.id}` }, load)
      .subscribe();
    const t = setInterval(load, 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [venue?.id]);

  const setDraft = (id: string, patch: Partial<Area>) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), ...patch } }));
  };

  const setMode = async (area: Area, mode: Area["throttle_mode"]) => {
    const patch: any = { throttle_mode: mode, throttle_enabled: true };
    if (mode === "block") {
      patch.throttle_block_until = new Date(
        Date.now() + area.throttle_block_timeout_minutes * 60_000,
      ).toISOString();
    } else {
      patch.throttle_block_until = null;
    }
    const { error } = await supabase.from("venue_display_areas").update(patch).eq("id", area.id);
    if (error) return toast.error(error.message);
    toast.success(`${area.name}: ${MODE_META[mode].label}`);
  };

  const toggleThrottling = async (area: Area, on: boolean) => {
    const { error } = await supabase
      .from("venue_display_areas")
      .update({ throttle_enabled: on, throttle_mode: on ? area.throttle_mode || "open" : "open" })
      .eq("id", area.id);
    if (error) return toast.error(error.message);
  };

  const saveDraft = async (area: Area) => {
    const d = drafts[area.id];
    if (!d || Object.keys(d).length === 0) return;
    const { error } = await supabase.from("venue_display_areas").update(d).eq("id", area.id);
    if (error) return toast.error(error.message);
    setDrafts((all) => { const { [area.id]: _, ...rest } = all; return rest; });
    toast.success(`${area.name} saved`);
  };

  const bumpNext = async (area: Area) => {
    const q = queues[area.id] ?? [];
    if (q.length === 0) return toast.info("No orders queued");
    const next = q[0];
    const { error } = await supabase.from("orders").update({ throttled_until: null }).eq("id", next.id);
    if (error) return toast.error(error.message);
    await supabase.from("order_throttle_log").insert({
      order_id: next.id,
      display_area_id: area.id,
      venue_id: area.venue_id,
      event: "bumped",
      queue_size_at_event: q.length,
      wait_added_minutes: 0,
    });
    toast.success("Order released");
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Operational Throttling</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pace orders to each station's capacity. Prevents the kitchen, bar, or expo from being overwhelmed during a rush.
        </p>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}

      {!loading && areas.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active Display Areas. Create one in Order Display System first.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {areas.map((area) => {
          const merged = { ...area, ...(drafts[area.id] ?? {}) } as Area;
          const meta = MODE_META[merged.throttle_mode];
          const queue = queues[area.id] ?? [];
          const hasDraft = !!drafts[area.id] && Object.keys(drafts[area.id]).length > 0;
          const blockExpiresIn = merged.throttle_block_until
            ? Math.max(0, Math.ceil((new Date(merged.throttle_block_until).getTime() - Date.now()) / 60_000))
            : 0;

          return (
            <Card key={area.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: area.color }} />
                      {area.name}
                    </CardTitle>
                    {area.description && (
                      <p className="text-xs text-muted-foreground mt-1">{area.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`en-${area.id}`} className="text-xs text-muted-foreground">Throttle</Label>
                    <Switch
                      id={`en-${area.id}`}
                      checked={merged.throttle_enabled}
                      onCheckedChange={(v) => toggleThrottling(area, v)}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Current state */}
                <div className="rounded-md bg-muted/40 p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${meta.color}`} />
                    <Badge variant="outline" className="gap-1">
                      <meta.icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{meta.help}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground leading-none">{queue.length}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">queued</div>
                  </div>
                </div>

                {merged.throttle_mode === "block" && blockExpiresIn > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Block reverts to Auto in <strong>{blockExpiresIn} min</strong>
                  </div>
                )}

                {/* Mode buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(MODE_META) as Array<keyof typeof MODE_META>).map((m) => {
                    const M = MODE_META[m];
                    const active = merged.throttle_mode === m;
                    return (
                      <Button
                        key={m}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        disabled={!merged.throttle_enabled}
                        onClick={() => setMode(area, m)}
                        className="gap-1"
                      >
                        <M.icon className="h-3.5 w-3.5" />
                        <span className="text-xs">{M.label}</span>
                      </Button>
                    );
                  })}
                </div>

                <Separator />

                {/* Capacity inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Max orders</Label>
                    <Input
                      type="number"
                      min={1}
                      value={merged.throttle_max_orders}
                      onChange={(e) => setDraft(area.id, { throttle_max_orders: Math.max(1, +e.target.value || 1) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">per minutes</Label>
                    <Input
                      type="number"
                      min={1}
                      value={merged.throttle_window_minutes}
                      onChange={(e) => setDraft(area.id, { throttle_window_minutes: Math.max(1, +e.target.value || 1) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Block timeout (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={merged.throttle_block_timeout_minutes}
                      onChange={(e) => setDraft(area.id, { throttle_block_timeout_minutes: Math.max(1, +e.target.value || 1) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Base prep time (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={merged.base_prep_time_minutes}
                      onChange={(e) => setDraft(area.id, { base_prep_time_minutes: Math.max(1, +e.target.value || 1) })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <Label htmlFor={`wait-${area.id}`} className="text-xs">Show extended wait to diners</Label>
                    <p className="text-[11px] text-muted-foreground">When queued, diners see "+N min" on their order.</p>
                  </div>
                  <Switch
                    id={`wait-${area.id}`}
                    checked={merged.throttle_show_wait_to_diner}
                    onCheckedChange={(v) => setDraft(area.id, { throttle_show_wait_to_diner: v })}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bumpNext(area)}
                    disabled={queue.length === 0}
                    className="flex-1"
                  >
                    <ArrowUp className="h-3.5 w-3.5 mr-1" />
                    Bump next
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveDraft(area)}
                    disabled={!hasDraft}
                    className="flex-1"
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
