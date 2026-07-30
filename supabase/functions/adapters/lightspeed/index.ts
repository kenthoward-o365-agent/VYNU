// Lightspeed (X-Series) adapter — routed through the Lovable connector gateway.
// Docs: https://developers.lightspeedhq.com
// The gateway URL already contains the store domain_prefix + API version, so
// paths here are relative to the version root (e.g. /outlets, /products).

import type {
  PosAdapter,
  PosAdapterContext,
  NormalisedMenu,
  OutboundOrder,
} from "../../_shared/pos-adapter.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/lightspeed";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  const connectionKey = Deno.env.get("LIGHTSPEED_API_KEY");
  if (!connectionKey) throw new Error("LIGHTSPEED_API_KEY is not configured — link the Lightspeed connector");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function lsFetch(path: string, init: RequestInit = {}) {
  return await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { ...gatewayHeaders(), ...(init.headers ?? {}) },
  });
}

const adapter: PosAdapter = {
  slug: "lightspeed",

  async authenticate() {
    // The gateway holds and refreshes the OAuth grant.
    return { token: "gateway", expiresAt: Date.now() + 3_600_000 };
  },

  async testConnection() {
    try {
      const res = await lsFetch(`/outlets?page_size=10`, { method: "GET" });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200);
        console.error(`[lightspeed] gateway ${res.status}: ${text}`);
        return { ok: false, message: `Lightspeed ${res.status}: ${text}` };
      }
      return { ok: true, message: "Connected to Lightspeed via connector gateway" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },

  async pullMenu(_ctx): Promise<NormalisedMenu> {
    const res = await lsFetch(`/products?page_size=200`, { method: "GET" });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new Error(`Lightspeed products ${res.status}: ${text}`);
    }
    const body = await res.json().catch(() => ({})) as { data?: Array<Record<string, any>> };
    const products = body.data ?? [];

    const categoryMap = new Map<string, string>();
    for (const p of products) {
      for (const t of p.product_categories ?? []) {
        if (t?.id) categoryMap.set(String(t.id), String(t.name ?? "Category"));
      }
    }

    return {
      categories: [...categoryMap.entries()].map(([pos_id, name], i) => ({ pos_id, name, display_order: i })),
      items: products.map((p) => ({
        pos_id: String(p.id),
        name: String(p.name ?? "Product"),
        description: p.description ?? null,
        price: Number(p.price_including_tax ?? p.supply_price ?? 0),
        category_pos_id: p.product_categories?.[0]?.id ? String(p.product_categories[0].id) : null,
        is_available: p.is_active !== false,
      })),
      modifierGroups: [],
    };
  },

  async sendOrder(ctx, order: OutboundOrder) {
    const res = await lsFetch(`/sales`, {
      method: "POST",
      body: JSON.stringify({
        register_id: ctx.config?.register_id ?? undefined,
        outlet_id: ctx.config?.account_id ?? undefined,
        source_id: order.orderId,
        line_items: order.lineItems.map((li) => ({
          product_id: li.posId,
          quantity: li.quantity,
          price: li.unitPrice,
        })),
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, any>;
    if (!res.ok) console.error(`[lightspeed] sale failed ${res.status}`, body);
    return {
      posOrderId: String(body?.data?.id ?? order.orderId),
      accepted: res.ok,
      raw: body,
    };
  },
};

export default adapter;
