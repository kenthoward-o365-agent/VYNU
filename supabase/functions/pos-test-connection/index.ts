import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAdapter } from "../_shared/pos-adapter.ts";

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

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: integ } = await supabase
      .from("venue_pos_integrations")
      .select("*, pos_providers!inner(slug)")
      .eq("venue_id", venue_id)
      .maybeSingle();

    if (!integ) {
      return new Response(JSON.stringify({ ok: false, message: "No integration configured" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const slug = (integ as any).pos_providers?.slug as string;
    const adapter = getAdapter(slug);
    if (!adapter) {
      return new Response(JSON.stringify({ ok: false, message: `No adapter for ${slug}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const result = await adapter.testConnection({
      venueId: venue_id,
      config: (integ as any).config ?? {},
      clientId: (integ as any).client_id,
      clientSecretRef: (integ as any).client_secret_ref,
      endpointUrl: (integ as any).endpoint_url,
      tokenCache: (integ as any).token_cache,
    });

    await supabase.from("venue_pos_integrations").update({
      connection_status: result.ok ? "connected" : "error",
      last_error: result.ok ? null : result.message,
      last_sync_at: new Date().toISOString(),
    }).eq("venue_id", venue_id);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, message: (err as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
