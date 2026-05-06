import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadAdapter } from "../_shared/pos-adapter.ts";
import { loadIntegration, buildContext, runWithBreaker } from "../_shared/pos-context.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const integ = await loadIntegration(supabase, venue_id);
    if (!integ) {
      return new Response(JSON.stringify({ ok: false, message: "No integration configured" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const slug = integ.pos_providers?.slug ?? integ.pos_provider;
    const adapter = await loadAdapter(slug);
    if (!adapter) {
      return new Response(JSON.stringify({ ok: false, message: `No adapter for ${slug}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const ctx = await buildContext(supabase, integ);
    const result = await runWithBreaker(supabase, integ, () => adapter.testConnection(ctx));

    if (result.ok) {
      const r = result.value;
      await supabase.from("venue_pos_integrations").update({
        connection_status: r.ok ? "connected" : "error",
        last_error: r.ok ? null : r.message,
        last_sync_at: new Date().toISOString(),
      }).eq("venue_id", venue_id);
      return new Response(JSON.stringify(r), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, message: result.error, breaker_tripped: result.tripped }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, message: (err as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
