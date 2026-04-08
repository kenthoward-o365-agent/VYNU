import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tonePrompts: Record<string, string> = {
  aussie: `You speak like a friendly Australian. Use casual Aussie slang naturally — "arvo", "reckon", "no worries", "ripper", "keen", "mate". Keep it laid-back and warm, like chatting with a mate at the pub.`,
  british: `You speak with warm British charm. Use expressions like "brilliant", "lovely", "cheers", "fancy", "rather", "quite". Be polished but approachable, like a friendly server at a gastropub.`,
  north_american: `You speak with casual North American friendliness. Use expressions like "awesome", "you bet", "for sure", "sounds great", "super". Be upbeat and enthusiastic, like a great server at a popular restaurant.`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, venue_id, menu_items, conversation } = await req.json();

    // Load venue AI config
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: aiConfig } = await sb
      .from("venue_ai_config")
      .select("agent_name, tone, chat_mode, opening_message")
      .eq("venue_id", venue_id)
      .maybeSingle();

    const agentName = aiConfig?.agent_name || "Sippa";
    const tone = aiConfig?.tone || "aussie";
    const toneInstruction = tonePrompts[tone] || tonePrompts.aussie;

    const menuContext = menu_items
      .map((i: any) => `- ${i.name} ($${i.price}) — ${i.description || "No description"}${i.dietary_tags?.length ? ` [${i.dietary_tags.join(", ")}]` : ""}${i.allergens?.length ? ` ⚠️ ${i.allergens.join(", ")}` : ""}`)
      .join("\n");

    const systemPrompt = `You are ${agentName}, a friendly AI server at a restaurant. You help diners choose dishes from the menu.

PERSONALITY & TONE:
${toneInstruction}

MENU:
${menuContext}

RULES:
- Be warm, casual, and helpful — like a great waiter
- Suggest specific items from the menu based on the diner's mood/preferences
- Consider dietary needs and allergens
- If they ask for something not on the menu, suggest the closest alternative
- Keep responses concise (2-3 sentences max) with item names in **bold**
- When recommending items, mention the price
- If the diner clearly wants to order specific items, include them in your response as a JSON array in a special format

When the diner explicitly says they want to order/add items, end your message with:
[ADD_ITEMS: item_id1, item_id2]
Only include item IDs that match the menu. Only do this when the diner clearly wants to order, not when you're just suggesting.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversation || []),
      { role: "user", content: message },
    ];

    const response = await fetch(LOVABLE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

    // Parse ADD_ITEMS if present
    const suggested_items: any[] = [];
    const addMatch = reply.match(/\[ADD_ITEMS:\s*(.+?)\]/);
    if (addMatch) {
      const ids = addMatch[1].split(",").map((s: string) => s.trim());
      ids.forEach((id: string) => {
        const item = menu_items.find((m: any) => m.id === id);
        if (item) {
          suggested_items.push({ id: item.id, name: item.name, price: item.price });
        }
      });
      reply = reply.replace(/\[ADD_ITEMS:.*?\]/, "").trim();
    }

    return new Response(JSON.stringify({ reply, suggested_items, agent_name: agentName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Diner chat error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
