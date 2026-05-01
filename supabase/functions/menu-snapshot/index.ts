// Public, edge-cached menu snapshot for a venue.
// Returns venue info, available menu items, categories, table info, active pricing rules,
// and AI chat config in ONE round-trip. Cached at the CDN for 30s and stale-while-revalidate 5min.
//
// Phase 5 follow-up:
//   1. Single RPC (`get_menu_snapshot`) instead of 6-7 separate queries.
//   2. Per-isolate single-flight guard so a cold cache + 500 simultaneous QR scans
//      collapse into ONE database call rather than 500.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Module-scope: shared across requests handled by the same isolate.
// Not cluster-wide (that would need Redis); good for ~10-50x herd reduction.
const inflight = new Map<string, Promise<unknown>>();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

async function loadSnapshot(venueId: string, tableId: string | null) {
  const { data, error } = await supabase.rpc("get_menu_snapshot", {
    _venue_id: venueId,
    _table_id: tableId,
  });
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const venueId = url.searchParams.get("venueId");
    const tableId = url.searchParams.get("tableId");

    if (!venueId) {
      return new Response(JSON.stringify({ error: "venueId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = `${venueId}|${tableId ?? ""}`;
    let promise = inflight.get(key);
    if (!promise) {
      promise = loadSnapshot(venueId, tableId).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, promise);
    }
    const body = await promise;

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // CDN cache for 30s, allow stale-while-revalidate for 5 minutes.
        // Lets us serve thousands of QR scans per second from edge cache.
        "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("menu-snapshot error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
