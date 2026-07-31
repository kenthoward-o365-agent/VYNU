const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireFeature } from '../_shared/require-feature.ts';
import { assertPublicUrl, SsrfError } from '../_shared/url-guard.ts';

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// HLRDRNW-68 · IVA-03 — bounds on AI-extracted menu data before it is written.
const MAX_IMPORT_CATEGORIES = 200;
const MAX_IMPORT_ITEMS_PER_CATEGORY = 500;
const MAX_IMPORT_NAME_LEN = 200;
const MAX_IMPORT_DESC_LEN = 2000;

const boundImportStr = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
};

const boundImportPrice = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

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
    const { url, text, pdf_base64, venue_id, menu_id } = await req.json();

    if (!venue_id) {
      return new Response(
        JSON.stringify({ error: 'venue_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!url && !text && !pdf_base64) {
      return new Response(
        JSON.stringify({ error: 'Provide a url, text, or pdf_base64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── AUTH FIRST — before any scraping or AI work ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is a manager of the target venue
    const { data: isMgr, error: mgrErr } = await supabase.rpc('is_venue_manager', {
      _user_id: user.id,
      _venue_id: venue_id,
    });
    if (mgrErr || !isMgr) {
      return new Response(
        JSON.stringify({ error: 'Not authorized for this venue' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const denied = await requireFeature(supabase, venue_id, 'ai.menu_import', corsHeaders);
    if (denied) return denied;

    // Resolve the target menu: the requested one (must belong to the venue),
    // otherwise the venue's first menu. Categories MUST carry a menu_id or they
    // are invisible in Menu Builder and to diners.
    let targetMenuId: string | null = null;
    if (menu_id) {
      const { data: menuRow } = await supabase
        .from('venue_menus')
        .select('id')
        .eq('id', menu_id)
        .eq('venue_id', venue_id)
        .maybeSingle();
      targetMenuId = menuRow?.id ?? null;
    }
    if (!targetMenuId) {
      const { data: firstMenu } = await supabase
        .from('venue_menus')
        .select('id')
        .eq('venue_id', venue_id)
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle();
      targetMenuId = firstMenu?.id ?? null;
    }

    let menuText = text || '';
    let pdfData = pdf_base64 || null;

    // If URL provided, scrape it
    if (url && !pdfData) {
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      // ── SSRF protection (HLRDRNW-68 · IVA-03) ──
      // Resolve the host and reject if it points at any private/link-local/
      // metadata address (DNS-rebinding and IPv6-mapped forms included), rather
      // than string-matching the hostname.
      try {
        await assertPublicUrl(formattedUrl);
      } catch (e) {
        const msg = e instanceof SsrfError ? e.message : 'Invalid URL';
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Scraping URL:', formattedUrl);
      const scrapeRes = await fetch(formattedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TabLess/1.0)' },
        redirect: 'manual',
      });

      if (scrapeRes.status >= 300 && scrapeRes.status < 400) {
        return new Response(
          JSON.stringify({ error: 'Redirects not followed (SSRF protection)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!scrapeRes.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch URL: ${scrapeRes.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const html = await scrapeRes.text();
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
        .substring(0, 30000);
    }


    if (!menuText && !pdfData) {
      return new Response(
        JSON.stringify({ error: 'Could not extract content from the source' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(pdfData ? `PDF received (${pdfData.length} chars base64)` : `Text extracted (${menuText.length} chars)`);

    // Call AI to extract structured menu data
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build user message content — multimodal for PDF, text for others
    const userContent = pdfData
      ? [
          { type: 'text', text: 'Extract all menu items from this PDF menu:' },
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${pdfData}` } }
        ]
      : `Extract all menu items from this text:\n\n${menuText}`;

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
            content: `You are a menu extraction specialist. Extract all menu items from the provided content (text or PDF).
Group items into categories. Detect allergens and dietary tags from descriptions.
If prices are in AUD, keep the number as-is. If no price is found, use 0.
Be thorough — extract every single menu item you can find.`
          },
          {
            role: 'user',
            content: userContent
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

    // Insert into database (auth + venue ownership already verified at top)


    let totalItems = 0;
    let totalCategories = 0;

    // HLRDRNW-68 · IVA-03 — the extracted menu is derived from attacker-influenced
    // scraped/PDF content, so bound the counts and validate each field before it
    // is written to the live menu.
    const categoriesToImport = Array.isArray(extractedMenu.categories)
      ? extractedMenu.categories.slice(0, MAX_IMPORT_CATEGORIES)
      : [];

    for (const cat of categoriesToImport) {
      const catName = boundImportStr(cat?.name, MAX_IMPORT_NAME_LEN);
      if (!catName) continue; // skip nameless / malformed categories

      // Create category
      const { data: catData, error: catErr } = await supabase
        .from('menu_categories')
        .insert({ venue_id, name: catName, display_order: totalCategories, menu_id: targetMenuId })
        .select('id')
        .single();

      if (catErr) {
        console.error('Category insert error:', catErr);
        continue;
      }
      totalCategories++;

      // Insert items
      const rawItems = Array.isArray(cat.items)
        ? cat.items.slice(0, MAX_IMPORT_ITEMS_PER_CATEGORY)
        : [];
      const itemPayloads = rawItems
        .map((item: any, idx: number) => {
          const itemName = boundImportStr(item?.name, MAX_IMPORT_NAME_LEN);
          if (!itemName) return null;
          return {
            venue_id,
            category_id: catData.id,
            name: itemName,
            description: boundImportStr(item?.description, MAX_IMPORT_DESC_LEN),
            price: boundImportPrice(item?.price),
            allergens: Array.isArray(item?.allergens) ? item.allergens.slice(0, 50) : [],
            dietary_tags: Array.isArray(item?.dietary_tags) ? item.dietary_tags.slice(0, 50) : [],
            display_order: idx,
            is_available: true,
          };
        })
        .filter(Boolean);

      if (itemPayloads.length > 0) {
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
    console.error('import-menu error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
