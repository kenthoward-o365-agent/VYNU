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

async function generateAndSaveImage(
  item: ItemToGenerate,
  venueId: string,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
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
    ({ imageUrl: base64Url } = await aiImage({ prompt }));
  } catch (e) {
    console.error(`AI error for ${item.name}:`, e instanceof AiError ? e.message : e);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "failed" })
      .eq("id", item.id);
    return;
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
    return;
  }

  const { data: urlData } = supabaseAdmin.storage.from("venue-assets").getPublicUrl(path);

  await supabaseAdmin
    .from("menu_items")
    .update({ image_url: urlData.publicUrl, image_ai_status: "generated" })
    .eq("id", item.id);

  console.log(`✓ Generated image for: ${item.name}`);
}

async function processInBackground(
  items: ItemToGenerate[],
  venueId: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  for (const item of items) {
    try {
      await generateAndSaveImage(item, venueId, supabaseAdmin);
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Unexpected error for ${item.name}:`, err);
      await supabaseAdmin
        .from("menu_items")
        .update({ image_ai_status: "failed" })
        .eq("id", item.id);
    }
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

    // Fail fast when no image provider is configured. Without this, every item
    // in the batch fails individually and the UI reports a finished run with
    // zero images. Image roles always use the gateway — the Anthropic key
    // covers chat only; Claude does not generate images.
    if (!gatewayConfigured()) {
      return new Response(JSON.stringify({
        error: "AI image generation is not configured — set AI_API_KEY (and AI_MODEL_IMAGE) in the platform's Supabase secrets. The Anthropic key covers chat only.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    EdgeRuntime.waitUntil(
      processInBackground(
        batch,
        venueId,
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey
      )
    );

    return new Response(
      JSON.stringify({ message: "Generation started", count: batch.length, remaining: remaining ?? 0 }),
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
