import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceRateLimit, getClientIp, tooManyRequests } from "../_shared/rate-limit.ts";
import { readJsonLimited, PayloadTooLargeError, payloadTooLarge } from "../_shared/http.ts";
import { aiImage, AiError, aiErrorResponse } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // AEA-04: this endpoint calls a paid AI image model. It was fully
    // unauthenticated (open cost-amplification). Require an authenticated
    // operator and rate-limit per user + IP.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      // The anon key satisfies the gateway but resolves to no user — reject it.
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const ip = getClientIp(req);
    const rl = await enforceRateLimit(admin, [
      { key: `generate-menu-image:user:${user.id}`, limit: 30, windowSec: 3600 },
      { key: `generate-menu-image:ip:${ip}`, limit: 60, windowSec: 3600 },
    ]);
    if (!rl.allowed) return tooManyRequests(corsHeaders);

    const { itemName, itemDescription } = await readJsonLimited(req) as {
      itemName?: string; itemDescription?: string;
    };
    if (!itemName) {
      return new Response(JSON.stringify({ error: "itemName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const desc = itemDescription ? ` described as: ${itemDescription}` : "";
    const prompt = `Generate a professional, appetizing food photography image of "${itemName}"${desc}. The image should look like a high-quality menu photo: well-lit, vibrant colors, clean plating on a neutral background. Top-down or 45-degree angle. No text, no watermarks, no logos. Photorealistic style.`;

    console.log("Generating image for:", itemName);

    // Not logged to ai_usage_log: the payload carries no venue_id, so there is
    // no venue to attribute the spend to. logAiImageUsage would no-op anyway.
    const { imageUrl } = await aiImage({ prompt });

    return new Response(JSON.stringify({ generatedImageBase64: imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof PayloadTooLargeError) return payloadTooLarge(corsHeaders);
    if (e instanceof AiError) return aiErrorResponse(e, corsHeaders);
    console.error("generate-menu-image error:", e);
    return new Response(JSON.stringify({ error: "Image generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
