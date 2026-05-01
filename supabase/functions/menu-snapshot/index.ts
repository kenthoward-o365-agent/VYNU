// Public, edge-cached menu snapshot for a venue.
// Returns venue info, available menu items, categories, table info, active pricing rules,
// and AI chat config in ONE round-trip. Cached at the CDN for 30s and stale-while-revalidate 5min.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const venueId = url.searchParams.get("venueId");
    const tableId = url.searchParams.get("tableId");

    if (!venueId) {
      return new Response(JSON.stringify({ error: "venueId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client — public anonymous data only, all queries scoped by venueId.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const [venueRes, itemsRes, catsRes, rulesRes, aiRes] = await Promise.all([
      supabase
        .from("venues")
        .select(
          "id, name, venue_type, logo_url, address, city, state, postcode, country, phone, email, landing_page_html, group_id, settings, is_active, operating_hours",
        )
        .eq("id", venueId)
        .maybeSingle(),
      supabase
        .from("menu_items")
        .select(
          "id, name, description, price, image_url, dietary_tags, allergens, is_available, category_id, display_order",
        )
        .eq("venue_id", venueId)
        .eq("is_available", true)
        .order("display_order"),
      supabase
        .from("menu_categories")
        .select("id, name, display_order")
        .eq("venue_id", venueId)
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("pricing_rules")
        .select("*")
        .eq("venue_id", venueId)
        .eq("is_active", true),
      supabase
        .from("venue_ai_config")
        .select("chat_mode, agent_name, agent_icon_url")
        .eq("venue_id", venueId)
        .maybeSingle(),
    ]);

    let table: { id: string; table_number: string } | null = null;
    if (tableId) {
      let tableRes = await supabase
        .from("tables")
        .select("id, table_number")
        .eq("id", tableId)
        .eq("venue_id", venueId)
        .maybeSingle();
      if (!tableRes.data) {
        tableRes = await supabase
          .from("tables")
          .select("id, table_number")
          .eq("table_number", tableId)
          .eq("venue_id", venueId)
          .maybeSingle();
      }
      table = tableRes.data ?? null;
    }

    const rules = rulesRes.data ?? [];
    let pricingLinks: { pricing_rule_id: string; menu_item_id: string }[] = [];
    if (rules.length > 0) {
      const { data: linkData } = await supabase
        .from("pricing_rule_items")
        .select("pricing_rule_id, menu_item_id")
        .in(
          "pricing_rule_id",
          rules.map((r: any) => r.id),
        );
      pricingLinks = (linkData ?? []) as any[];
    }

    const body = {
      venue: venueRes.data ?? null,
      table,
      items: itemsRes.data ?? [],
      categories: catsRes.data ?? [],
      pricing: { rules, links: pricingLinks },
      ai: aiRes.data ?? null,
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // CDN cache for 30s, allow stale-while-revalidate for 5 minutes.
        // Lets us serve thousands of QR scans per second from edge cache.
        "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("menu-snapshot error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
