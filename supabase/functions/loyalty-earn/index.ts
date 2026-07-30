// Loyalty award entry-point. Phase 4: enqueues to pgmq and returns immediately.
// The actual awarding happens in process-job-queue (drained by pg_cron every 10s).
//
// Set sync=true in the body or X-Sync-Loyalty header for legacy callers /
// tests that need an immediate result.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { awardLoyalty } from "../_shared/loyalty-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-loyalty",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface EarnBody {
  order_id?: string;
  diner_id?: string | null;
  sync?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as EarnBody;
    const { order_id, diner_id } = body;
    if (!order_id || typeof order_id !== "string") {
      return json({ error: "order_id is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Require authentication — prevents anonymous loyalty fraud
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return json({ error: "Authentication required" }, 401);
    }

    // Authorize: caller must be either venue staff for the order's venue,
    // or the diner who placed the order (matching diner_id).
    const { data: order } = await admin
      .from("orders")
      .select("id, venue_id, diner_id")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) {
      return json({ error: "Order not found" }, 404);
    }

    const { data: isStaff } = await admin.rpc("is_venue_manager", {
      _user_id: user.id,
      _venue_id: order.venue_id,
    });

    const { data: dinerProfile } = await admin
      .from("diner_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const callerDinerId = dinerProfile?.id || null;

    const effectiveDinerId = diner_id ?? order.diner_id ?? null;
    const isOwnerDiner =
      !!callerDinerId &&
      !!effectiveDinerId &&
      callerDinerId === effectiveDinerId;

    if (!isStaff && !isOwnerDiner) {
      return json({ error: "Not authorized for this order" }, 403);
    }
    const wantSync =
      body.sync === true || req.headers.get("x-sync-loyalty") === "1";

    // Mirror the earn to Pub+ (Eagle Eye AIR) when the venue's group has the
    // integration enabled. Fire-and-forget: never blocks the local award.
    const mirrorToPubPlus = async () => {
      try {
        const { data: venue } = await admin
          .from("venues").select("group_id").eq("id", order.venue_id).maybeSingle();
        if (!venue?.group_id) return;
        const { data: cfg } = await admin
          .from("pubplus_integrations")
          .select("enabled, auto_earn_on_paid")
          .eq("group_id", venue.group_id)
          .maybeSingle();
        if (!cfg?.enabled || !cfg.auto_earn_on_paid) return;
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pubplus-air`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ action: "earn", order_id }),
        });
      } catch (e) {
        console.error("pubplus mirror failed", e);
      }
    };

    if (wantSync) {
      const result = await awardLoyalty(admin, { order_id, diner_id });
      await mirrorToPubPlus();
      return json(result, result.error ? 500 : 200);
    }

    // Async path: enqueue and return.
    const { data: msgId, error } = await admin.rpc("enqueue_job", {
      _queue: "jobs_loyalty",
      _payload: { order_id, diner_id },
    });
    if (error) {
      console.error("enqueue_job failed", error);
      return json({ error: "Failed to enqueue loyalty job" }, 500);
    }

    void mirrorToPubPlus();

    return json({ enqueued: true, msg_id: msgId });
  } catch (err) {
    console.error("loyalty-earn error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
