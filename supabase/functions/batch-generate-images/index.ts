import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireFeature } from "../_shared/require-feature.ts";
import { aiImage, AiError, gatewayConfigured } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ITEMS_PER_BATCH = 10;
const STALE_BATCH_MINUTES = 10;
const FUNCTION_NAME = "batch-generate-images";

interface ItemToGenerate {
  id: string;
  name: string;
  description: string | null;
}

function normalizeItems(input: unknown): ItemToGenerate[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      description: typeof item.description === "string" ? item.description : null,
    }))
    .filter((item) => item.id.length > 0 && item.name.length > 0);
}

async function resetStaleItems(
  venueId: string,
  supabaseAdmin: ReturnType<typeof createClient>
) {
  const cutoff = new Date(Date.now() - STALE_BATCH_MINUTES * 60 * 1000).toISOString();

  const { data: staleItems, error } = await supabaseAdmin
    .from("menu_items")
    .select("id")
    .eq("venue_id", venueId)
    .is("image_url", null)
    .in("image_ai_status", ["queued", "processing"])
    .lt("updated_at", cutoff);

  if (error) {
    console.error("Failed to inspect stale image jobs:", error.message);
    return;
  }

  if (!staleItems?.length) return;

  const { error: resetError } = await supabaseAdmin
    .from("menu_items")
    .update({ image_ai_status: null })
    .in("id", staleItems.map((item) => item.id));

  if (resetError) {
    console.error("Failed to reset stale image jobs:", resetError.message);
    return;
  }

  console.log(`Reset ${staleItems.length} stale image job(s).`);
}

async function loadNextBatch(
  venueId: string,
  supabaseAdmin: ReturnType<typeof createClient>
) {
  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, description")
    .eq("venue_id", venueId)
    .is("image_url", null)
    .is("image_ai_status", null)
    .order("updated_at", { ascending: true })
    .limit(MAX_ITEMS_PER_BATCH);

  if (error) {
    throw new Error(`Failed to load next image batch: ${error.message}`);
  }

  return (data ?? []) as ItemToGenerate[];
}

async function triggerNextBatch(
  venueId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      apikey: supabaseServiceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ venueId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to queue next batch: ${response.status} ${errorText}`);
  }

  await response.text();
}

/**
 * Normalised library key for a dish name: lowercased, parentheticals stripped
 * ("Chicken Parmigiana (GF)" and "Chicken Parmigiana" share one image),
 * non-alphanumerics collapsed to single spaces.
 */
export function normalizeDishKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Apply a library image to an item — no AI call, no cap draw. */
async function applyLibraryImage(
  item: ItemToGenerate,
  dishKey: string,
  imageUrl: string,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  await supabaseAdmin
    .from("menu_items")
    .update({ image_url: imageUrl, image_ai_status: "generated" })
    .eq("id", item.id);
  await supabaseAdmin.rpc("bump_dish_image_usage", { _dish_key: dishKey });
  console.log(`✓ Library image applied for: ${item.name}`);
}

async function generateAndSaveImage(
  item: ItemToGenerate,
  venueId: string,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<boolean> {
  await supabaseAdmin
    .from("menu_items")
    .update({ image_ai_status: "processing" })
    .eq("id", item.id);

  const desc = item.description ? ` described as: ${item.description}` : "";
  const prompt = `Generate a professional, appetizing food photography image of "${item.name}"${desc}. The image should look like a high-quality menu photo: well-lit, vibrant colors, clean plating on a neutral background. Top-down or 45-degree angle. No text, no watermarks, no logos. Photorealistic style.`;

  // Handled here rather than left to the caller's catch: returning normally on
  // failure keeps the 1s inter-item pause in processInBackground, which is what
  // stops a run of 429s from hammering the gateway.
  let base64Url: string;
  try {
    ({ imageUrl: base64Url } = await aiImage({
      prompt,
      usage: { venueId, feature: "menu_image_batch", meta: { item: item.name } },
    }));
  } catch (e) {
    console.error(`AI error for ${item.name}:`, e instanceof AiError ? e.message : e);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "failed" })
      .eq("id", item.id);
    return false;
  }

  // Detect actual MIME type from data URI prefix
  const mimeMatch = base64Url.match(/^data:image\/(\w+);base64,/);
  const ext = mimeMatch?.[1] || "png";
  const contentType = `image/${ext}`;

  const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const path = `menu-items/${venueId}/generated/${item.id}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("venue-assets")
    .upload(path, bytes, { contentType, upsert: true });

  if (uploadError) {
    console.error(`Upload failed for ${item.name}:`, uploadError.message);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "failed" })
      .eq("id", item.id);
    // The provider call succeeded (and drew cap) even though storage failed.
    return true;
  }

  const { data: urlData } = supabaseAdmin.storage.from("venue-assets").getPublicUrl(path);

  await supabaseAdmin
    .from("menu_items")
    .update({ image_url: urlData.publicUrl, image_ai_status: "generated" })
    .eq("id", item.id);

  // Seed the shared library so the next venue with this dish reuses the image
  // free. A dedicated library copy keeps it independent of this venue's files.
  const dishKey = normalizeDishKey(item.name);
  if (dishKey) {
    try {
      const libPath = `library/dishes/${dishKey.replace(/ /g, "-")}.${ext}`;
      const { error: libUpload } = await supabaseAdmin.storage
        .from("venue-assets")
        .upload(libPath, bytes, { contentType, upsert: false });
      if (!libUpload || libUpload.message?.includes("already exists")) {
        const { data: libUrl } = supabaseAdmin.storage.from("venue-assets").getPublicUrl(libPath);
        await supabaseAdmin.from("dish_image_library").upsert(
          { dish_key: dishKey, display_name: item.name, image_url: libUrl.publicUrl },
          { onConflict: "dish_key", ignoreDuplicates: true },
        );
      }
    } catch (e) {
      // Library seeding is best-effort — never fail the venue's own image.
      console.error(`Library seed failed for ${item.name}:`, e);
    }
  }

  console.log(`✓ Generated image for: ${item.name}`);
  return true;
}

async function processInBackground(
  items: ItemToGenerate[],
  venueId: string,
  libraryMap: Map<string, string>,
  aiAllowance: number,
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  let capSkipped = 0;
  for (const item of items) {
    try {
      const dishKey = normalizeDishKey(item.name);
      const libraryUrl = dishKey ? libraryMap.get(dishKey) : undefined;

      if (libraryUrl) {
        // Free: reuse the shared library image. No provider call, no cap draw.
        await applyLibraryImage(item, dishKey, libraryUrl, supabaseAdmin);
        continue;
      }

      if (aiAllowance <= 0) {
        // Out of allowance (or no provider configured): leave the item
        // untouched rather than parking it in a fake queue.
        await supabaseAdmin
          .from("menu_items")
          .update({ image_ai_status: null })
          .eq("id", item.id);
        capSkipped++;
        continue;
      }

      const usedProvider = await generateAndSaveImage(item, venueId, supabaseAdmin);
      if (usedProvider) aiAllowance--;
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Unexpected error for ${item.name}:`, err);
      await supabaseAdmin
        .from("menu_items")
        .update({ image_ai_status: "failed" })
        .eq("id", item.id);
    }
  }

  // Re-triggering after a cap/provider skip would loop forever over the same
  // unservable items — the response already told the UI why we stopped.
  if (capSkipped > 0) {
    console.log(`Batch complete. ${capSkipped} item(s) left for later (cap/provider).`);
    return;
  }

  try {
    await triggerNextBatch(venueId, supabaseUrl, supabaseServiceKey);
  } catch (err) {
    console.error("Failed to trigger next batch:", err);
  }

  console.log(`Batch complete. Processed ${items.length} items.`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const venueId = typeof body?.venueId === "string" ? body.venueId : "";
    const requestedItems = normalizeItems(body?.items);

    if (!venueId) {
      return new Response(JSON.stringify({ error: "venueId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NOTE: a missing image provider no longer hard-fails the request — the
    // batch still applies free shared-library images and simply skips AI
    // generation (library-only mode) until AI_API_KEY is configured.

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // AUTHN/AUTHZ: accept service-role bearer (self re-trigger) or a venue-manager JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bearer = authHeader.slice(7).trim();
    if (bearer !== supabaseServiceKey) {
      const caller = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await caller.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });
      const { data: isMgr } = await supabaseAdmin.rpc("is_venue_manager", { _user_id: user.id, _venue_id: venueId });
      if (!isAdmin && !isMgr) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Shared helper: the venue's AI-generation allowance (library reuse is
    // free and never counted). Usage = provider calls logged to ai_usage_log.
    const readCap = async () => {
      const { data: flags } = await supabaseAdmin
        .from("venue_feature_flags")
        .select("image_gen_limit")
        .eq("venue_id", venueId)
        .maybeSingle();
      const limit = flags?.image_gen_limit ?? 100;
      const { count: used } = await supabaseAdmin
        .from("ai_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .in("feature", ["menu_image_batch", "menu_image_single"]);
      return { limit, used: used ?? 0, remaining: Math.max(0, limit - (used ?? 0)) };
    };

    // Preflight probe for the UI: provider status, cap, and how many of the
    // venue's missing images the shared library already covers.
    if (body?.probe === true) {
      const cap = await readCap();
      const { data: missing } = await supabaseAdmin
        .from("menu_items")
        .select("name")
        .eq("venue_id", venueId)
        .is("image_url", null);
      const keys = [...new Set((missing ?? []).map((m) => normalizeDishKey(m.name)).filter(Boolean))];
      let libraryCoverage = 0;
      if (keys.length) {
        const { count } = await supabaseAdmin
          .from("dish_image_library")
          .select("id", { count: "exact", head: true })
          .in("dish_key", keys);
        libraryCoverage = count ?? 0;
      }
      return new Response(JSON.stringify({
        configured: gatewayConfigured(),
        capUsed: cap.used,
        capLimit: cap.limit,
        missingImages: missing?.length ?? 0,
        libraryCoverage,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Feature gate — AI image batch is Feast-only in the default preset.
    const denied = await requireFeature(supabaseAdmin, venueId, "ai.image_batch", corsHeaders);
    if (denied) return denied;

    await resetStaleItems(venueId, supabaseAdmin);

    const { count: activeCount, error: activeError } = await supabaseAdmin
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .is("image_url", null)
      .in("image_ai_status", ["queued", "processing"]);

    if (activeError) {
      throw new Error(`Failed to inspect active image jobs: ${activeError.message}`);
    }

    if (!requestedItems.length && (activeCount ?? 0) > 0) {
      return new Response(
        JSON.stringify({ message: "Generation already in progress", count: 0, remaining: activeCount ?? 0 }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batch = requestedItems.length > 0
      ? requestedItems.slice(0, MAX_ITEMS_PER_BATCH)
      : await loadNextBatch(venueId, supabaseAdmin);

    if (batch.length === 0) {
      return new Response(
        JSON.stringify({ message: "No eligible items to generate", count: 0, remaining: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ids = batch.map((i) => i.id);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "queued" })
      .in("id", ids);

    const { count: remaining, error: remainingError } = await supabaseAdmin
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .is("image_url", null)
      .is("image_ai_status", null);

    if (remainingError) {
      throw new Error(`Failed to count remaining image jobs: ${remainingError.message}`);
    }

    // Split the batch: shared-library hits are free; the rest need the
    // provider and draw the venue's allowance.
    const cap = await readCap();
    const batchKeys = [...new Set(batch.map((i) => normalizeDishKey(i.name)).filter(Boolean))];
    const libraryMap = new Map<string, string>();
    if (batchKeys.length) {
      const { data: libRows } = await supabaseAdmin
        .from("dish_image_library")
        .select("dish_key, image_url")
        .in("dish_key", batchKeys);
      for (const row of libRows ?? []) libraryMap.set(row.dish_key, row.image_url);
    }
    const libraryHits = batch.filter((i) => libraryMap.has(normalizeDishKey(i.name))).length;
    const aiNeeded = batch.length - libraryHits;
    const providerConfigured = gatewayConfigured();
    const aiAllowance = providerConfigured ? cap.remaining : 0;
    const capReached = aiNeeded > aiAllowance;

    // Nothing in this batch is servable: no library hits, and either the
    // provider is missing or the allowance is spent. Un-queue and say why.
    if (libraryHits === 0 && aiNeeded > 0 && aiAllowance === 0) {
      await supabaseAdmin
        .from("menu_items")
        .update({ image_ai_status: null })
        .in("id", ids);
      return new Response(JSON.stringify({
        error: providerConfigured
          ? `AI image limit reached (${cap.used} of ${cap.limit} used). Contact VYNU to raise it.`
          : "AI image generation isn't available yet — the platform's image provider is not configured. Items matching the shared dish library will still receive images automatically.",
        capReached: providerConfigured,
        providerConfigured,
        capUsed: cap.used,
        capLimit: cap.limit,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    EdgeRuntime.waitUntil(
      processInBackground(
        batch,
        venueId,
        libraryMap,
        aiAllowance,
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey
      )
    );

    return new Response(
      JSON.stringify({
        message: "Generation started",
        count: batch.length,
        remaining: remaining ?? 0,
        libraryHits,
        aiNeeded,
        providerConfigured,
        capReached,
        capUsed: cap.used,
        capLimit: cap.limit,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("batch-generate-images error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
