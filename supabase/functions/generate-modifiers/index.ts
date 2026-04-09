const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
              description: "Menu item IDs this category should be assigned to"
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

    // Verify user auth
    const authHeader = req.headers.get('Authorization');
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
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
    const menuSummary = menuItems.map(item => {
      const catName = categories?.find(c => c.id === item.category_id)?.name || 'Uncategorized';
      return `- [${item.id}] ${item.name} (${catName})${item.description ? ': ' + item.description : ''} — $${item.price}`;
    }).join('\n');

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiRes = await fetch(LOVABLE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
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
- Use the exact menu item IDs provided in brackets [id] for suggested_items.
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
        tool_choice: { type: 'function', function: { name: 'generate_modifiers' } }
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('AI error:', errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiData = await aiRes.json();

    let result;
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      } else {
        const content = aiData.choices?.[0]?.message?.content || '';
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
      return new Response(JSON.stringify({ error: 'No modifiers could be generated' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
