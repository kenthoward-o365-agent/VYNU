// On-demand and scheduled menu pull from a POS provider.
//
// Body: { venue_id: string }
// Authn: requires either service-role (called from worker/cron) or a venue
// manager JWT (called from the dashboard "Sync menu now" button).
//
// Calls adapter.pullMenu() and upserts categories + menu_items into our
// schema by pos_id. Idempotent — re-running is safe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadAdapter } from "../_shared/pos-adapter.ts";
import { loadIntegration, buildContext, runWithBreaker } from "../_shared/pos-context.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { venue_id?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const venueId = body.venue_id;
  if (!venueId) return json(400, { error: "venue_id required" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const integ = await loadIntegration(supabase, venueId);
  if (!integ) return json(404, { error: "No POS integration for venue" });
  if (!integ.sync_pos_to_us) return json(200, { ok: true, skipped: "sync_pos_to_us disabled" });

  const slug = integ.pos_providers?.slug ?? integ.pos_provider;
  const adapter = await loadAdapter(slug);
  if (!adapter?.pullMenu) return json(400, { error: `Adapter ${slug} has no pullMenu` });

  const ctx = await buildContext(supabase, integ);
  const result = await runWithBreaker(supabase, integ, () => adapter.pullMenu!(ctx));
  if (!result.ok) {
    await supabase.from("pos_sync_log").insert({
      venue_id: venueId, event_type: "menu_pull", direction: "inbound",
      result: "error", error_message: result.error,
    });
    return json(500, { ok: false, error: result.error });
  }

  const menu = result.value;
  let upsertedCats = 0, upsertedItems = 0;

  // Upsert categories
  for (const c of menu.categories ?? []) {
    const { error } = await supabase
      .from("menu_categories")
      .upsert({
        venue_id: venueId,
        name: c.name,
        pos_id: c.pos_id,
        display_order: c.display_order ?? 0,
        is_active: true,
      }, { onConflict: "venue_id,pos_id", ignoreDuplicates: false } as any);
    if (!error) upsertedCats++;
  }

  // Look up category id map
  const { data: cats } = await supabase
    .from("menu_categories")
    .select("id, pos_id")
    .eq("venue_id", venueId);
  const catMap = new Map<string, string>();
  for (const c of cats ?? []) {
    if ((c as any).pos_id) catMap.set(String((c as any).pos_id), String((c as any).id));
  }

  // Upsert items
  for (const it of menu.items ?? []) {
    const { error } = await supabase
      .from("menu_items")
      .upsert({
        venue_id: venueId,
        pos_id: it.pos_id,
        plu: it.pos_id,
        name: it.name,
        description: it.description ?? null,
        price: it.price,
        category_id: it.category_pos_id ? (catMap.get(it.category_pos_id) ?? null) : null,
        is_available: it.is_available ?? true,
        dietary_tags: it.dietary_tags ?? [],
        allergens: it.allergens ?? [],
      }, { onConflict: "venue_id,pos_id", ignoreDuplicates: false } as any);
    if (!error) upsertedItems++;
  }

  await supabase.from("venue_pos_integrations").update({
    last_menu_pull_at: new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
    sync_status: "idle",
  }).eq("venue_id", venueId);

  await supabase.from("pos_sync_log").insert({
    venue_id: venueId, event_type: "menu_pull", direction: "inbound",
    result: "success", items_synced: upsertedItems,
  });

  return json(200, { ok: true, categories: upsertedCats, items: upsertedItems });
});
