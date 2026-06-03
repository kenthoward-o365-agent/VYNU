import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeReadiness } from "../_shared/onboarding-readiness.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") ?? "";
    const sbUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userRes } = await sbUser.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isManager } = await sbUser.rpc("is_venue_manager", { _user_id: userRes.user.id, _venue_id: venue_id });
    if (!isManager) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const readiness = await computeReadiness(sb, venue_id);

    if (!readiness.ready_to_go_live) {
      const missing = readiness.stages
        .filter((s) => s.blocker && s.status !== "done" && s.status !== "n_a")
        .map((s) => s.title);
      return new Response(JSON.stringify({ error: "Not ready to go live", missing }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    await sb.from("venues").update({ is_live: true, went_live_at: now }).eq("id", venue_id);
    await sb.from("venue_onboarding_state").upsert({
      venue_id,
      status: "completed",
      completed_at: now,
      readiness_snapshot: readiness,
      updated_at: now,
    }, { onConflict: "venue_id" });

    return new Response(JSON.stringify({ ok: true, went_live_at: now }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("onboarding-go-live error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
