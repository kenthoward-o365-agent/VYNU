import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiImage, AiError, aiErrorResponse } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Image editing is the slowest AI call in the product; aiChat applies this as an
// abort deadline and surfaces AiError(504).
const AI_REQUEST_TIMEOUT_MS = 90_000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication — this endpoint consumes paid AI credits
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "imageUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "imageUrl must be a valid image URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageUrl: enhancedImageUrl } = await aiImage({
      role: "image-edit",
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
      prompt: [
        {
          type: "text",
          text: "Enhance this food or drink photo for a mobile menu display. Improve lighting, color vibrancy, sharpness, and white balance. Make the food look appetizing and professional while keeping the subject and composition the same. Do not add text, props, or new elements.",
        },
        {
          type: "image_url",
          image_url: { url: imageUrl },
        },
      ],
    });

    return new Response(JSON.stringify({ enhancedImageBase64: enhancedImageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AiError) return aiErrorResponse(e, corsHeaders);
    console.error("enhance-menu-image error:", e);
    // Deliberately generic: the previous version echoed e.message straight to
    // the client, which can carry upstream detail (see _shared/safe-error.ts).
    return new Response(JSON.stringify({ error: "Image enhancement failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
