import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ItemToGenerate {
  id: string;
  name: string;
  description: string | null;
}

async function generateAndSaveImage(
  item: ItemToGenerate,
  venueId: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  lovableApiKey: string
) {
  // Mark as processing
  await supabaseAdmin
    .from("menu_items")
    .update({ image_ai_status: "processing" })
    .eq("id", item.id);

  const desc = item.description ? ` described as: ${item.description}` : "";
  const prompt = `Generate a professional, appetizing food photography image of "${item.name}"${desc}. The image should look like a high-quality menu photo: well-lit, vibrant colors, clean plating on a neutral background. Top-down or 45-degree angle. No text, no watermarks, no logos. Photorealistic style.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    console.error(`AI error for ${item.name}: ${status}`);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "failed" })
      .eq("id", item.id);
    return;
  }

  const data = await response.json();
  const base64Url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!base64Url) {
    console.error(`No image returned for ${item.name}`);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "failed" })
      .eq("id", item.id);
    return;
  }

  // Upload to storage
  const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const path = `menu-items/${venueId}/generated/${item.id}-${Date.now()}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("venue-assets")
    .upload(path, bytes, { contentType: "image/png", upsert: true });

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
  lovableApiKey: string
) {
  for (const item of items) {
    try {
      await generateAndSaveImage(item, venueId, supabaseAdmin, lovableApiKey);
      // Small delay between items to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Unexpected error for ${item.name}:`, err);
      await supabaseAdmin
        .from("menu_items")
        .update({ image_ai_status: "failed" })
        .eq("id", item.id);
    }
  }
  console.log(`Batch generation complete. Processed ${items.length} items.`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venueId, items } = await req.json() as { venueId: string; items: ItemToGenerate[] };

    if (!venueId || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "venueId and items[] required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Mark all items as queued
    const ids = items.map((i) => i.id);
    await supabaseAdmin
      .from("menu_items")
      .update({ image_ai_status: "queued" })
      .in("id", ids);

    // Process in background — response returns immediately
    EdgeRuntime.waitUntil(processInBackground(items, venueId, supabaseAdmin, LOVABLE_API_KEY));

    return new Response(
      JSON.stringify({ message: "Generation started", count: items.length }),
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
