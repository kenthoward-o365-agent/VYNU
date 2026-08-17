const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireFeature } from '../_shared/require-feature.ts';

import { aiChat, AiError, aiErrorResponse } from '../_shared/ai.ts';

const MODIFIER_SCHEMA = {
  name: "generate_modifiers",
  description: "Generate modifier categories and modifiers for restaurant menu items",
  parameters: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Category name e.g. 'Meat Temperature', 'Remove Ingredient', 'Extras', 'Size', 'Sauce Choice'" },
            modifiers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Modifier name e.g. 'Rare', 'No Tomato', 'Extra Cheese'" },
                  price: { type: "number", description: "Additional cost. 0 for free modifiers like temperature or removals." },
                },
                required: ["name", "price"]
              }
            },
            suggested_items: {
              type: "array",
              items: { type: "string" },
              // Indexes, not UUIDs: echoing 36-char UUIDs for a 100+ item menu
              // blows the output budget (the original cause of "none could be
              // generated" truncations). Mapped back to UUIDs after parsing.
              description: "Menu item index numbers from the list, e.g. [\"3\", \"17\"]"
            },
            is_required: { type: "boolean", description: "Whether this modifier category should be required (e.g. meat temp for steak) or optional (e.g. extras)" }
          },
          required: ["name", "modifiers", "suggested_items", "is_required"]
        }
      }
    },
    required: ["categories"]
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { venue_id } = await req.json();

    if (!venue_id) {
      return new Response(JSON.stringify({ error: 'venue_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user auth + venue manager authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch menu items
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'tabless_admin' });
    const { data: isMgr } = await supabase.rpc('is_venue_manager', { _user_id: user.id, _venue_id: venue_id });
    if (!isAdmin && !isMgr) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const denied = await requireFeature(supabase, venue_id, 'ai.modifier_gen', corsHeaders);
    if (denied) return denied;

    const { data: menuItems, error: itemsErr } = await supabase
      .from('menu_items')
      .select('id, name, description, category_id, price')
      .eq('venue_id', venue_id)
      .eq('is_available', true);

    if (itemsErr) {
      console.error('Menu items fetch error:', itemsErr);
      return new Response(JSON.stringify({ error: 'Failed to fetch menu items' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!menuItems || menuItems.length === 0) {
      return new Response(JSON.stringify({ error: 'No menu items found. Add menu items first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: categories } = await supabase
      .from('menu_categories')
      .select('id, name')
      .eq('venue_id', venue_id);

    // Build menu summary for AI
    // Items are numbered [1..n] in the prompt and the model returns indexes;
    // UUIDs are mapped back after parsing (see suggested_items in the schema).
    const menuSummary = menuItems.map((item, i) => {
      const catName = categories?.find(c => c.id === item.category_id)?.name || 'Uncategorized';
      return `- [${i + 1}] ${item.name} (${catName})${item.description ? ': ' + item.description : ''} — $${item.price}`;
    }).join('\n');

    let aiMessage: any = null;
    try {
      const ai = await aiChat({
        role: 'chat-advanced',
        messages: [
          {
            role: 'system',
            content: `You are a restaurant operations expert. Analyze the menu items and generate appropriate modifier categories and modifiers.

Rules:
- For proteins (steak, burger, salmon, lamb, tuna, etc.) create a "Meat Temperature" or "Cooking Temperature" category with options like Rare, Medium Rare, Medium, Medium Well, Well Done. Mark as required.
- For items with common removable ingredients, create "Remove Ingredient" categories (e.g. No Tomato, No Onion, No Lettuce). Mark as optional.
- For items that could have extras/add-ons, create "Extras" or "Add-ons" categories with prices. Mark as optional.
- For items with size options, create "Size" category. Mark as required.
- For items with sauce/dressing choices, create appropriate categories. Mark as optional or required based on context.
- Use the item index numbers provided in brackets [n] for suggested_items (e.g. ["3", "17"]). Never invent indexes.
- Be thorough but practical — only suggest modifiers that make culinary sense.
- Prices for extras should be reasonable (typically $1-5 AUD for add-ons).
- Removal modifiers and temperature choices should be free (price: 0).`
          },
          {
            role: 'user',
            content: `Analyze these menu items and generate modifier categories with modifiers:\n\n${menuSummary}`
          }
        ],
        tools: [{
          type: 'function',
          function: MODIFIER_SCHEMA
        }],
        toolChoice: { type: 'function', function: { name: 'generate_modifiers' } },
        // A 100+ item menu's modifier JSON easily exceeded the 8192 default
        // when suggested_items carried UUIDs; a truncated tool call surfaces
        // as "no tool_calls" and read as "none could be generated". Indexes
        // shrink the output ~4x; 16k is comfortable and keeps the
        // non-streaming request inside HTTP timeout territory.
        maxTokens: 16384,
        timeoutMs: 120_000,
        usage: { venueId: venue_id, feature: 'modifier_gen', meta: { items: menuItems.length } }
      });
      aiMessage = ai.message;
      const finish = ai.raw?.choices?.[0]?.finish_reason;
      if (finish === 'length') {
        console.error(`generate-modifiers: output truncated at max_tokens (${menuItems.length} items)`);
        return new Response(JSON.stringify({
          error: 'The menu is too large to analyse in one pass — try disabling some items and re-running.'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      if (e instanceof AiError) return aiErrorResponse(e, corsHeaders);
      throw e;
    }

    let result;
    try {
      const toolCall = aiMessage?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      } else {
        const content = aiMessage?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Parse error:', e);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!result?.categories) {
      // Log enough to diagnose the next occurrence without guessing.
      console.error('generate-modifiers: no categories in AI response', JSON.stringify({
        had_tool_calls: !!aiMessage?.tool_calls?.length,
        content_head: (aiMessage?.content || '').slice(0, 300),
      }));
      return new Response(JSON.stringify({ error: 'No modifiers could be generated' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Map the model's 1-based item indexes back to menu item UUIDs. Tolerates
    // numbers or numeric strings; anything unmappable (including a stray UUID
    // from a model that ignored the format) is passed through only if it is a
    // real item id, otherwise dropped.
    const validIds = new Set(menuItems.map(i => i.id));
    for (const cat of result.categories) {
      if (!Array.isArray(cat?.suggested_items)) { cat.suggested_items = []; continue; }
      cat.suggested_items = cat.suggested_items
        .map((ref: unknown) => {
          const n = Number(ref);
          if (Number.isInteger(n) && n >= 1 && n <= menuItems.length) return menuItems[n - 1].id;
          return typeof ref === 'string' && validIds.has(ref) ? ref : null;
        })
        .filter((id: string | null): id is string => id !== null);
    }

    // Return suggestions (not auto-inserted — operator reviews first)
    return new Response(JSON.stringify({
      success: true,
      suggestions: result.categories,
      menu_items: menuItems.map(i => ({ id: i.id, name: i.name }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('generate-modifiers error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
