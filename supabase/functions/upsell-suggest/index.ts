import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logAiUsage } from "../_shared/ai-usage.ts";
import { enforceRateLimit, getClientIp, tooManyRequests } from "../_shared/rate-limit.ts";
import { readJsonLimited, boundedArray, PayloadTooLargeError, payloadTooLarge } from "../_shared/http.ts";
import { hasFeature } from "../_shared/require-feature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  dietary_tags: string[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // AEA-11: cap body size, then bound attacker-controlled arrays.
    const reqBody = await readJsonLimited(req) as Record<string, unknown>;
    const { trigger, added_item, venue_name, venue_id } = reqBody as {
      trigger?: string; added_item?: any; venue_name?: string; venue_id?: string;
    };
    const menu_items = boundedArray<any>(reqBody.menu_items, 200);
    const cart_items = boundedArray<any>(reqBody.cart_items, 100);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (!menu_items.length) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate venue exists and is live before charging AI cost to it.
    if (!venue_id || typeof venue_id !== "string") {
      return new Response(JSON.stringify({ error: "venue_id required", suggestions: [] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: venueRow } = await sb
      .from("venues").select("id, is_active").eq("id", venue_id).maybeSingle();
    if (!venueRow || venueRow.is_active === false) {
      return new Response(JSON.stringify({ error: "Venue not available", suggestions: [] }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AEA-04/AEA-02: anonymous consumer endpoint calling a paid AI model —
    // bound cost-amplification per venue and per IP.
    const ip = getClientIp(req);
    const rl = await enforceRateLimit(sb, [
      { key: `upsell-suggest:venue:${venue_id}`, limit: 240, windowSec: 3600 },
      { key: `upsell-suggest:ip:${ip}`, limit: 120, windowSec: 3600 },
    ]);
    if (!rl.allowed) return tooManyRequests(corsHeaders);

    // Package enforcement. The guest app now hides these controls, but a client
    // can still call this directly, so the endpoint is the real gate.
    //
    // Deliberately placed AFTER the rate limiter: returning early above it gave
    // venues without the feature an uncapped path that still performed the venue
    // and flag lookups on every request. Denied callers are now bounded by the
    // same limits as everyone else.
    //
    // Returns 200 with no suggestions rather than 403: the upsell is an optional
    // enhancement, the client already renders nothing for an empty list, and a
    // disabled feature is not an error condition worth surfacing to the diner.
    if (!(await hasFeature(sb, venue_id, "ai.upsell"))) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Build context-aware prompt based on trigger type
    let userPrompt = "";
    const menuSummary = (menu_items as MenuItem[])
      .map((m) => `- ${m.name} ($${m.price}) [id:${m.id}]${m.description ? ` — ${m.description}` : ""}`)
      .join("\n");

    if (trigger === "contextual_pairing" && added_item) {
      userPrompt = `A guest at "${venue_name}" just added "${added_item.name}" ($${added_item.price}) to their order. Suggest ONE complementary menu item that pairs well with it. Think about flavour pairing: steak→red wine, coffee→pastry, burger→side, etc. Only suggest from the menu below.\n\nMenu:\n${menuSummary}`;
    } else if (trigger === "addon_prompt" && added_item) {
      userPrompt = `A guest just selected "${added_item.name}" ($${added_item.price}). Suggest ONE quick add-on or upgrade from the menu — a side, a size upgrade, or a small extra that enhances their choice. Keep it low-friction and helpful.\n\nMenu:\n${menuSummary}`;
    } else if (trigger === "cart_suggestions" && cart_items?.length) {
      const cartSummary = cart_items.map((c: any) => `${c.name} x${c.quantity}`).join(", ");
      userPrompt = `A guest has these items in their cart: ${cartSummary}. Suggest up to 2 additional low-friction items (a side, dessert, or drink) that complement their order. Only suggest items NOT already in their cart.\n\nMenu:\n${menuSummary}`;
    } else {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxSuggestions = trigger === "cart_suggestions" ? 2 : 1;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful restaurant suggestion engine. You suggest complementary menu items to enhance a guest's dining experience. Every suggestion must feel helpful, never pushy. Return suggestions using the provided tool. Only suggest items that exist in the menu (use exact item IDs). Keep suggestion_text to one short, friendly sentence.`,
          },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_suggestions",
              description: "Return upsell suggestions for the guest",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    maxItems: maxSuggestions,
                    items: {
                      type: "object",
                      properties: {
                        item_id: { type: "string", description: "The menu item ID" },
                        suggestion_text: {
                          type: "string",
                          description: "A short, friendly one-liner explaining why this pairs well",
                        },
                      },
                      required: ["item_id", "suggestion_text"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_suggestions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited", suggestions: [] }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted", suggestions: [] }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    if (venue_id) {
      logAiUsage({ venueId: venue_id, feature: "upsell", model: "google/gemini-3-flash-preview", usage: aiResult?.usage, requestId: response.headers.get("X-Lovable-AIG-Run-ID") }).catch(() => {});
    }
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { suggestions: { item_id: string; suggestion_text: string }[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate that suggested item IDs actually exist in the menu
    const menuIds = new Set((menu_items as MenuItem[]).map((m) => m.id));
    const validSuggestions = parsed.suggestions
      .filter((s) => menuIds.has(s.item_id))
      .slice(0, maxSuggestions)
      .map((s) => {
        const item = (menu_items as MenuItem[]).find((m) => m.id === s.item_id)!;
        return {
          item_id: s.item_id,
          name: item.name,
          price: item.price,
          image_url: item.image_url,
          suggestion_text: s.suggestion_text,
        };
      });

    return new Response(JSON.stringify({ suggestions: validSuggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof PayloadTooLargeError) return payloadTooLarge(corsHeaders);
    console.error("upsell-suggest error:", e);
    return new Response(
      JSON.stringify({ error: "Something went wrong", suggestions: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
