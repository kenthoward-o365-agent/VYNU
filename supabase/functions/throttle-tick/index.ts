// Operational Throttling tick — runs every 30s via pg_cron.
// For every venue Display Area with throttling enabled:
//   1. Auto-flip block → auto when block_until expires
//   2. Auto-flip auto → open when queue has been empty for >2 min
//   3. Auto-flip open → auto when queue exceeds capacity
//   4. Release the next batch of throttled orders at the configured rate
//   5. Recalculate extra_wait_minutes for orders still queued
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require CRON_SECRET or service-role bearer
  const auth = req.headers.get("authorization") || "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || (token !== cronSecret && token !== svcKey)) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const summary: Record<string, unknown> = { ts: now.toISOString(), areas: 0, released: 0, mode_flips: 0 };

  try {
    const { data: areas, error: areasErr } = await supabase
      .from("venue_display_areas")
      .select("*")
      .eq("throttle_enabled", true);

    if (areasErr) throw areasErr;
    summary.areas = areas?.length ?? 0;

    for (const area of areas ?? []) {
      // ---- 1. Block timeout ----
      if (area.throttle_mode === "block" && area.throttle_block_until && new Date(area.throttle_block_until) <= now) {
        await supabase
          .from("venue_display_areas")
          .update({ throttle_mode: "auto", throttle_block_until: null })
          .eq("id", area.id);
        area.throttle_mode = "auto";
        area.throttle_block_until = null;
        summary.mode_flips = (summary.mode_flips as number) + 1;
      }

      // ---- 2. Build the area's queue (orders still throttled) ----
      // Look up orders touching this area via item or category mapping.
      const { data: queueRows } = await supabase.rpc("get_area_queue" as any, {
        _area_id: area.id,
      }).then(
        (r) => r,
        () => ({ data: null }),
      );

      // Fallback: do it client-side if RPC not present
      let queue: Array<{ id: string; throttled_until: string | null; created_at: string }> = [];
      if (Array.isArray(queueRows)) {
        queue = queueRows as any;
      } else {
        // Query orders for venue with throttled_until > now, then filter by area in app code.
        const { data: throttled } = await supabase
          .from("orders")
          .select("id, throttled_until, created_at, order_items(menu_item_id, menu_items:menu_items(category_id))")
          .eq("venue_id", area.venue_id)
          .not("throttled_until", "is", null)
          .gt("throttled_until", now.toISOString())
          .order("throttled_until", { ascending: true });

        const { data: itemAreas } = await supabase
          .from("menu_item_display_areas")
          .select("menu_item_id")
          .eq("display_area_id", area.id);
        const { data: catAreas } = await supabase
          .from("menu_category_display_areas")
          .select("category_id")
          .eq("display_area_id", area.id);
        const itemIds = new Set((itemAreas ?? []).map((r: any) => r.menu_item_id));
        const catIds = new Set((catAreas ?? []).map((r: any) => r.category_id));

        queue = (throttled ?? []).filter((o: any) =>
          (o.order_items ?? []).some((oi: any) =>
            itemIds.has(oi.menu_item_id) ||
            catIds.has(oi.menu_items?.category_id)
          )
        ).map((o: any) => ({ id: o.id, throttled_until: o.throttled_until, created_at: o.created_at }));
      }

      const queueSize = queue.length;
      const perOrderMinutes = Math.max(area.throttle_window_minutes / Math.max(area.throttle_max_orders, 1), 1);

      // ---- 3. Auto-mode transitions ----
      if (area.throttle_mode === "open" && queueSize > area.throttle_max_orders) {
        await supabase
          .from("venue_display_areas")
          .update({ throttle_mode: "auto" })
          .eq("id", area.id);
        area.throttle_mode = "auto";
        summary.mode_flips = (summary.mode_flips as number) + 1;
      } else if (area.throttle_mode === "auto" && queueSize === 0) {
        // empty queue — flip back to open
        await supabase
          .from("venue_display_areas")
          .update({ throttle_mode: "open" })
          .eq("id", area.id);
        area.throttle_mode = "open";
        summary.mode_flips = (summary.mode_flips as number) + 1;
      }

      // ---- 4. Release the next N orders for auto / test ----
      if (area.throttle_mode === "auto") {
        const releaseCount = Math.max(Math.floor(area.throttle_max_orders / area.throttle_window_minutes * 0.5), 1);
        const toRelease = queue.slice(0, releaseCount);
        for (const o of toRelease) {
          await supabase
            .from("orders")
            .update({ throttled_until: null })
            .eq("id", o.id);
          await supabase.from("order_throttle_log").insert({
            order_id: o.id,
            display_area_id: area.id,
            venue_id: area.venue_id,
            event: "released",
            queue_size_at_event: queueSize,
            wait_added_minutes: 0,
          });
          summary.released = (summary.released as number) + 1;
        }

        // ---- 5. Recompute extra_wait_minutes for remaining queued orders ----
        const remaining = queue.slice(toRelease.length);
        for (let i = 0; i < remaining.length; i++) {
          const newWait = Math.ceil((i + 1) * perOrderMinutes);
          await supabase
            .from("orders")
            .update({ extra_wait_minutes: newWait })
            .eq("id", remaining[i].id);
        }
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("throttle-tick error", e);
    return new Response(JSON.stringify({ error: (e as Error).message, summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
