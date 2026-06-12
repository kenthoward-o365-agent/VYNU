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

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, serviceKey);

  const nowIso = new Date().toISOString();
  const summary = { firedSessions: 0, closedSessions: 0, errors: [] as string[] };

  try {
    // 1) Auto-close any open/firing sessions past their auto_close_at
    const { data: toClose } = await sb
      .from("table_sessions")
      .select("id")
      .in("status", ["open", "firing"])
      .lte("auto_close_at", nowIso);

    for (const s of toClose || []) {
      const { error } = await sb.rpc("close_table_session", { _session_id: s.id });
      if (error) summary.errors.push(`close ${s.id}: ${error.message}`);
      else summary.closedSessions++;
    }

    // 2) For wait_for_all sessions still open, auto-fire if newest order is older than fire_grace_seconds
    const { data: openSessions } = await sb
      .from("table_sessions")
      .select("id, venue_id, fire_strategy, opened_at")
      .eq("status", "open")
      .eq("fire_strategy", "wait_for_all");

    // Pull all venue settings once we know which venues are involved
    const venueIds = Array.from(new Set((openSessions || []).map((s: any) => s.venue_id)));
    const venueGrace: Record<string, number> = {};
    if (venueIds.length) {
      const { data: venues } = await sb.from("venues").select("id, settings").in("id", venueIds);
      for (const v of venues || []) {
        const grace = (v.settings as any)?.table_session?.fire_grace_seconds;
        venueGrace[v.id] = typeof grace === "number" ? grace : 90;
      }
    }

    for (const s of openSessions || []) {
      const grace = venueGrace[s.venue_id] ?? 90;

      // Find newest order in the session
      const { data: latestOrder } = await sb
        .from("orders")
        .select("created_at")
        .eq("session_id", s.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // No orders yet — leave it alone (will be closed by idle rule eventually)
      if (!latestOrder) continue;

      const ageSec = (Date.now() - new Date(latestOrder.created_at).getTime()) / 1000;
      if (ageSec >= grace) {
        const { error } = await sb.rpc("fire_table_session", { _session_id: s.id });
        if (error) summary.errors.push(`fire ${s.id}: ${error.message}`);
        else summary.firedSessions++;
      }
    }

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
