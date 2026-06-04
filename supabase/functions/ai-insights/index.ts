// AI Insights edge function: produces product mix, loss leaders, food cost alerts,
// and pricing optimisation recommendations for a venue using Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MenuItemRow {
  id: string;
  name: string;
  price: number;
  food_cost: number | null;
  category_id: string | null;
}

interface OrderItemRow {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  order_id: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { venueId, days = 30, fromIso, toIso, rangeLabel } = await req.json();
    if (!venueId) {
      return json({ error: "venueId required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth check — require requester to be venue staff
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const { data: staff } = await supabase
      .from("venue_staff")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("venue_id", venueId)
      .maybeSingle();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "tabless_admin");
    if (!staff && !isAdmin) return json({ error: "forbidden" }, 403);

    // Resolve window: explicit from/to range takes precedence over `days`
    const fromDate = fromIso ? new Date(fromIso) : new Date(Date.now() - days * 86400000);
    const toDate = toIso ? new Date(toIso) : new Date();
    const windowDays = Math.max(
      1,
      Math.round((toDate.getTime() - fromDate.getTime()) / 86400000),
    );
    const sinceIso = fromDate.toISOString();
    const untilIso = toDate.toISOString();

    // Fetch completed orders within window
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, total, created_at, status")
      .eq("venue_id", venueId)
      .in("status", ["served", "paid"])
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso);
    if (ordersErr) throw ordersErr;

    const orderIds = (orders ?? []).map((o) => o.id);

    // Fetch order items
    let items: OrderItemRow[] = [];
    if (orderIds.length > 0) {
      const { data: oi, error: oiErr } = await supabase
        .from("order_items")
        .select("menu_item_id, quantity, unit_price, order_id, created_at")
        .in("order_id", orderIds);
      if (oiErr) throw oiErr;
      items = (oi ?? []) as OrderItemRow[];
    }

    // Fetch menu items
    const { data: menu, error: menuErr } = await supabase
      .from("menu_items")
      .select("id, name, price, food_cost, category_id")
      .eq("venue_id", venueId);
    if (menuErr) throw menuErr;
    const menuMap = new Map<string, MenuItemRow>(
      (menu ?? []).map((m) => [m.id, m as MenuItemRow]),
    );

    // Aggregate per item
    const agg = new Map<
      string,
      { qty: number; revenue: number; orders: Set<string> }
    >();
    for (const it of items) {
      const cur = agg.get(it.menu_item_id) ?? {
        qty: 0,
        revenue: 0,
        orders: new Set<string>(),
      };
      cur.qty += Number(it.quantity) || 0;
      cur.revenue += (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
      cur.orders.add(it.order_id);
      agg.set(it.menu_item_id, cur);
    }

    const totalQty = Array.from(agg.values()).reduce((s, v) => s + v.qty, 0);
    const totalRevenue = Array.from(agg.values()).reduce((s, v) => s + v.revenue, 0);

    type Row = {
      id: string;
      name: string;
      price: number;
      foodCost: number | null;
      qty: number;
      revenue: number;
      mixPct: number;
      revPct: number;
      foodCostPct: number | null;
      grossMargin: number | null;
    };
    const rows: Row[] = (menu ?? []).map((m) => {
      const a = agg.get(m.id);
      const qty = a?.qty ?? 0;
      const revenue = a?.revenue ?? 0;
      const fc = m.food_cost != null ? Number(m.food_cost) : null;
      const fcPct = fc != null && m.price > 0 ? fc / Number(m.price) : null;
      return {
        id: m.id,
        name: m.name,
        price: Number(m.price),
        foodCost: fc,
        qty,
        revenue,
        mixPct: totalQty > 0 ? qty / totalQty : 0,
        revPct: totalRevenue > 0 ? revenue / totalRevenue : 0,
        foodCostPct: fcPct,
        grossMargin: fc != null ? Number(m.price) - fc : null,
      };
    });

    const sold = rows.filter((r) => r.qty > 0);
    const topSellers = [...sold].sort((a, b) => b.qty - a.qty).slice(0, 10);
    const topRevenue = [...sold].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const slowMovers = (menu ?? []).length > 0
      ? rows
          .filter((r) => r.qty <= Math.max(2, Math.floor(totalQty * 0.005)))
          .sort((a, b) => a.qty - b.qty)
          .slice(0, 10)
      : [];
    // Loss leaders: high volume, low margin (food cost pct > 40% AND in top 50% by qty)
    const medianQty = sold.length
      ? [...sold].sort((a, b) => a.qty - b.qty)[Math.floor(sold.length / 2)].qty
      : 0;
    const lossLeaders = sold
      .filter((r) => r.foodCostPct != null && r.foodCostPct > 0.4 && r.qty >= medianQty)
      .sort((a, b) => (b.foodCostPct! - a.foodCostPct!))
      .slice(0, 10);
    const foodCostAlerts = rows
      .filter((r) => r.foodCostPct != null && r.foodCostPct > 0.5)
      .sort((a, b) => (b.foodCostPct! - a.foodCostPct!))
      .slice(0, 10);

    const summary = {
      windowDays,
      rangeLabel: rangeLabel ?? null,
      fromIso: sinceIso,
      toIso: untilIso,
      orderCount: orders?.length ?? 0,
      totalRevenue,
      totalUnitsSold: totalQty,
      menuSize: menu?.length ?? 0,
      itemsWithFoodCost: rows.filter((r) => r.foodCost != null).length,
    };

    // AI recommendations via Lovable AI Gateway
    let recommendations: string[] = [];
    let aiError: string | null = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && sold.length > 0) {
      try {
        const prompt = buildPrompt(summary, topSellers, slowMovers, lossLeaders, foodCostAlerts);
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are Spark, an AI revenue analyst for hospitality venues. Return concise, actionable recommendations as a JSON array of short strings. No prose outside JSON.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });
        if (resp.ok) {
          const j = await resp.json();
          logAiUsage({ venueId: venueId as string, feature: "insights", model: "google/gemini-2.5-flash", usage: j?.usage, requestId: resp.headers.get("X-Lovable-AIG-Run-ID") }).catch(() => {});
          const text = j?.choices?.[0]?.message?.content ?? "";
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed)) {
                recommendations = parsed.map((x) => String(x)).slice(0, 8);
              }
            } catch (_) {
              recommendations = text.split("\n").map((s: string) => s.replace(/^[-*0-9.\s]+/, "").trim()).filter(Boolean).slice(0, 8);
            }
          }
        } else {
          aiError = `AI gateway ${resp.status}`;
        }
      } catch (e) {
        aiError = (e as Error).message;
      }
    }

    return json({
      summary,
      topSellers,
      topRevenue,
      slowMovers,
      lossLeaders,
      foodCostAlerts,
      recommendations,
      aiError,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("ai-insights error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPrompt(
  summary: any,
  topSellers: any[],
  slowMovers: any[],
  lossLeaders: any[],
  foodCostAlerts: any[],
) {
  const fmt = (arr: any[]) =>
    arr
      .map(
        (r) =>
          `${r.name} | qty:${r.qty} | rev:$${r.revenue.toFixed(0)} | mix:${(r.mixPct * 100).toFixed(1)}% | foodCost%:${r.foodCostPct != null ? (r.foodCostPct * 100).toFixed(0) + "%" : "n/a"} | price:$${r.price.toFixed(2)}`,
      )
      .join("\n");
  return `Venue performance window: last ${summary.windowDays} days.
Orders: ${summary.orderCount}, Revenue: $${summary.totalRevenue.toFixed(0)}, Units sold: ${summary.totalUnitsSold}, Menu size: ${summary.menuSize}, Items costed: ${summary.itemsWithFoodCost}.

TOP SELLERS:
${fmt(topSellers)}

SLOW MOVERS:
${fmt(slowMovers)}

LOSS LEADERS (high volume + low margin):
${fmt(lossLeaders)}

FOOD COST ALERTS (food cost % > 50):
${fmt(foodCostAlerts)}

Return a JSON array of 4-6 short, specific recommendations covering: pricing optimisation, menu engineering (promote/demote/remove), bundling/upsell ideas, and food cost actions. Each item must reference specific dish names and a numeric action where possible.`;
}
