import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-location-id",
};

// Allergen ID → label mapping per Shyndig API spec
const ALLERGEN_MAP: Record<number, string> = {
  1: "Gluten",
  2: "Peanuts",
  3: "Tree Nuts",
  4: "Dairy",
  5: "Eggs",
  6: "Shellfish",
  7: "Fish",
  8: "Soy",
  9: "Sesame",
  10: "Lupin",
  11: "Molluscs",
  12: "Mustard",
  13: "Celery",
  14: "Sulphites",
};

async function verifyHmac(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

function hashPayload(payload: string): string {
  // Simple hash for dedup logging
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const rawBody = await req.text();
    const locationId =
      req.headers.get("x-location-id") ||
      new URL(req.url).pathname.split("/").pop();
    const signature = req.headers.get("x-signature") || "";

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: "locationId required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Look up venue by location_id
    const { data: integration, error: intErr } = await supabase
      .from("venue_pos_integrations")
      .select("*")
      .eq("location_id", locationId)
      .single();

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ error: "Unknown locationId" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const venueId = integration.venue_id;

    // Verify HMAC if webhook_secret is configured
    if (integration.webhook_secret && signature) {
      const valid = await verifyHmac(
        integration.webhook_secret,
        rawBody,
        signature
      );
      if (!valid) {
        await supabase.from("pos_sync_log").insert({
          venue_id: venueId,
          event_type: "product_sync",
          direction: "inbound",
          result: "error",
          error_message: "HMAC verification failed",
        });
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }
    }

    // Update sync status
    await supabase
      .from("venue_pos_integrations")
      .update({ sync_status: "syncing" })
      .eq("venue_id", venueId);

    const body = JSON.parse(rawBody);
    const { products = [], categories = [] } = body;
    let itemsSynced = 0;

    // Upsert categories
    for (const cat of categories) {
      const { data: existing } = await supabase
        .from("menu_categories")
        .select("id")
        .eq("venue_id", venueId)
        .eq("pos_id", String(cat.categoryId || cat.id))
        .maybeSingle();

      const catData: Record<string, unknown> = {
        name: cat.name,
        is_active: cat.isActive !== false,
        sort_order: cat.sortOrder ?? cat.displayOrder ?? 0,
      };

      if (existing) {
        await supabase
          .from("menu_categories")
          .update(catData)
          .eq("id", existing.id);
      } else {
        await supabase.from("menu_categories").insert({
          ...catData,
          venue_id: venueId,
          pos_id: String(cat.categoryId || cat.id),
          display_order: cat.sortOrder ?? cat.displayOrder ?? 0,
        });
      }
    }

    // Build category lookup (pos_id → uuid)
    const { data: allCats } = await supabase
      .from("menu_categories")
      .select("id, pos_id")
      .eq("venue_id", venueId)
      .not("pos_id", "is", null);

    const catLookup: Record<string, string> = {};
    for (const c of allCats || []) {
      if (c.pos_id) catLookup[c.pos_id] = c.id;
    }

    // Upsert products
    for (const prod of products) {
      const plu = String(prod.plu || prod.id);
      const allergenIds: number[] = prod.allergens || [];
      const allergenLabels = allergenIds
        .map((id: number) => ALLERGEN_MAP[id])
        .filter(Boolean);
      const tags: string[] = prod.tags || [];
      const dietaryTags = tags.filter((t: string) =>
        ["Vegan", "Vegetarian", "Gluten Free", "Dairy Free", "Keto", "Halal"].includes(t)
      );

      const categoryPosId = String(prod.categoryId || "");
      const categoryUuid = catLookup[categoryPosId] || null;

      const itemData: Record<string, unknown> = {
        name: prod.name,
        description: prod.description || null,
        price: prod.price, // integer cents
        is_available: prod.isAvailable !== false,
        allergens: allergenLabels,
        dietary_tags: dietaryTags,
        plu,
        pos_id: plu,
        pos_allergens: allergenIds,
        pos_tags: tags,
        category_id: categoryUuid,
        prep_time_minutes: prod.prepTimeMinutes || null,
      };

      const { data: existing } = await supabase
        .from("menu_items")
        .select("id")
        .eq("venue_id", venueId)
        .eq("plu", plu)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("menu_items")
          .update(itemData)
          .eq("id", existing.id);
      } else {
        await supabase.from("menu_items").insert({
          ...itemData,
          venue_id: venueId,
        });
      }
      itemsSynced++;
    }

    // Update integration status
    await supabase
      .from("venue_pos_integrations")
      .update({
        sync_status: "idle",
        last_sync_at: new Date().toISOString(),
      })
      .eq("venue_id", venueId);

    // Log success
    await supabase.from("pos_sync_log").insert({
      venue_id: venueId,
      event_type: "product_sync",
      direction: "inbound",
      payload_hash: hashPayload(rawBody),
      result: "success",
      items_synced: itemsSynced,
    });

    return new Response(
      JSON.stringify({
        success: true,
        categories_synced: categories.length,
        items_synced: itemsSynced,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Log error
    try {
      await supabase.from("pos_sync_log").insert({
        venue_id: "00000000-0000-0000-0000-000000000000",
        event_type: "product_sync",
        direction: "inbound",
        result: "error",
        error_message: err.message,
      });
    } catch (_) {
      // ignore logging failure
    }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
