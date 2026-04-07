const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOVABLE_API_URL = "https://ai-gateway.lovable.dev/v1/chat/completions";

const EXTRACTION_SCHEMA = {
  name: "extract_menu",
  description: "Extract menu items from restaurant menu text",
  parameters: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Category name e.g. Entrees, Mains, Desserts, Drinks" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Item name" },
                  description: { type: "string", description: "Item description if available" },
                  price: { type: "number", description: "Price as a number. If no price found, use 0" },
                  allergens: {
                    type: "array",
                    items: { type: "string" },
                    description: "Detected allergens like Gluten, Dairy, Nuts, Shellfish, Eggs, Soy, Fish, Sesame"
                  },
                  dietary_tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Detected dietary tags like Vegan, Vegetarian, Gluten Free, Dairy Free, Keto, Halal"
                  },
                },
                required: ["name", "price"]
              }
            }
          },
          required: ["name", "items"]
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
    const { url, text, venue_id } = await req.json();

    if (!venue_id) {
      return new Response(
        JSON.stringify({ error: 'venue_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!url && !text) {
      return new Response(
        JSON.stringify({ error: 'Either url or text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let menuText = text || '';

    // If URL provided, scrape it
    if (url) {
      console.log('Scraping URL:', url);
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const scrapeRes = await fetch(formattedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TabLess/1.0)' }
      });

      if (!scrapeRes.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch URL: ${scrapeRes.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const html = await scrapeRes.text();
      // Strip HTML tags to get text content
      menuText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 30000); // Limit to ~30k chars for AI context
    }

    if (!menuText || menuText.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Could not extract enough text from the source' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracted ${menuText.length} chars, sending to AI...`);

    // Call AI to extract structured menu data
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiRes = await fetch(LOVABLE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a menu extraction specialist. Extract all menu items from the provided text. 
Group items into categories. Detect allergens and dietary tags from descriptions.
If prices are in AUD, keep the number as-is. If no price is found, use 0.
Be thorough — extract every single menu item you can find.`
          },
          {
            role: 'user',
            content: `Extract all menu items from this text:\n\n${menuText}`
          }
        ],
        tools: [{
          type: 'function',
          function: EXTRACTION_SCHEMA
        }],
        tool_choice: { type: 'function', function: { name: 'extract_menu' } }
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('AI error:', errText);
      return new Response(
        JSON.stringify({ error: 'AI extraction failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiRes.json();
    console.log('AI response received');

    // Parse the tool call response
    let extractedMenu;
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        extractedMenu = JSON.parse(toolCall.function.arguments);
      } else {
        // Fallback: try parsing from content
        const content = aiData.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedMenu = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (e) {
      console.error('Parse error:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!extractedMenu?.categories) {
      return new Response(
        JSON.stringify({ error: 'No menu items could be extracted' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now insert into database
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify user has access (get user from JWT)
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalItems = 0;
    let totalCategories = 0;

    for (const cat of extractedMenu.categories) {
      // Create category
      const { data: catData, error: catErr } = await supabase
        .from('menu_categories')
        .insert({ venue_id, name: cat.name, display_order: totalCategories })
        .select('id')
        .single();

      if (catErr) {
        console.error('Category insert error:', catErr);
        continue;
      }
      totalCategories++;

      // Insert items
      if (cat.items && cat.items.length > 0) {
        const itemPayloads = cat.items.map((item: any, idx: number) => ({
          venue_id,
          category_id: catData.id,
          name: item.name,
          description: item.description || null,
          price: item.price || 0,
          allergens: item.allergens || [],
          dietary_tags: item.dietary_tags || [],
          display_order: idx,
          is_available: true,
        }));

        const { error: itemErr } = await supabase.from('menu_items').insert(itemPayloads);
        if (itemErr) {
          console.error('Items insert error:', itemErr);
        } else {
          totalItems += itemPayloads.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        categories_created: totalCategories,
        items_created: totalItems,
        extracted: extractedMenu
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
