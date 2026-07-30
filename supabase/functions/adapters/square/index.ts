// Square adapter — Square Connect v2 API.
// Docs: https://developer.squareup.com
// Auth: OAuth2 access token stored in Vault (ctx.secrets.access_token).

import type {
  PosAdapter,
  PosAdapterContext,
  NormalisedMenu,
  OutboundOrder,
} from "../../_shared/pos-adapter.ts";

const SQUARE_VERSION = "2024-01-18";

function base(ctx: PosAdapterContext): string {
  return ctx.config?.sandbox
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
}

function locationId(ctx: PosAdapterContext): string {
  return String(ctx.config?.location_id ?? "");
}

function token(ctx: PosAdapterContext): string {
  const t = ctx.secrets?.access_token;
  if (!t) throw new Error("Square access token not configured");
  return t;
}

async function squareFetch(ctx: PosAdapterContext, path: string, init: RequestInit = {}) {
  return await fetch(`${base(ctx)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token(ctx)}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

const adapter: PosAdapter = {
  slug: "square",

  async authenticate(ctx) {
    return { token: token(ctx), expiresAt: Date.now() + 3_600_000 };
  },

  async testConnection(ctx) {
    const loc = locationId(ctx);
    if (!loc) return { ok: false, message: "Missing Square location_id" };
    try {
      const res = await squareFetch(ctx, `/locations/${loc}`, { method: "GET" });
      if (!res.ok) return { ok: false, message: `Square ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { ok: true, message: "Connected to Square location" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },

  async pullMenu(ctx): Promise<NormalisedMenu> {
    const res = await squareFetch(ctx, `/catalog/search`, {
      method: "POST",
      body: JSON.stringify({ object_types: ["ITEM", "CATEGORY", "MODIFIER_LIST"] }),
    });
    if (!res.ok) throw new Error(`Square catalog ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json().catch(() => ({})) as { objects?: Array<Record<string, any>> };
    const objects = body.objects ?? [];

    const categories = objects
      .filter((o) => o.type === "CATEGORY")
      .map((o, i) => ({
        pos_id: String(o.id),
        name: String(o.category_data?.name ?? "Category"),
        display_order: i,
      }));

    const items = objects
      .filter((o) => o.type === "ITEM")
      .flatMap((o) => {
        const variations = o.item_data?.variations ?? [{}];
        return variations.map((v: Record<string, any>) => ({
          pos_id: String(v.id ?? o.id),
          name: String(o.item_data?.name ?? "Item"),
          description: o.item_data?.description ?? null,
          price: Number(v.item_variation_data?.price_money?.amount ?? 0) / 100,
          category_pos_id: o.item_data?.category_id ?? null,
          is_available: true,
        }));
      });

    const modifierGroups = objects
      .filter((o) => o.type === "MODIFIER_LIST")
      .map((o) => ({
        pos_id: String(o.id),
        name: String(o.modifier_list_data?.name ?? "Modifiers"),
        min_selection: 0,
        max_selection: Number(o.modifier_list_data?.selection_type === "SINGLE" ? 1 : 0),
        options: (o.modifier_list_data?.modifiers ?? []).map((m: Record<string, any>) => ({
          pos_id: String(m.id),
          name: String(m.modifier_data?.name ?? "Option"),
          price: Number(m.modifier_data?.price_money?.amount ?? 0) / 100,
        })),
      }));

    return { categories, items, modifierGroups };
  },

  async sendOrder(ctx, order: OutboundOrder) {
    const res = await squareFetch(ctx, `/orders`, {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: order.orderId,
        order: {
          location_id: locationId(ctx),
          reference_id: order.orderId,
          line_items: order.lineItems.map((li) => ({
            catalog_object_id: li.posId,
            quantity: String(li.quantity),
            note: li.notes ?? undefined,
            modifiers: (li.modifiers ?? []).map((m) => ({ catalog_object_id: m.posId })),
          })),
        },
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, any>;
    return {
      posOrderId: String(body?.order?.id ?? order.orderId),
      accepted: res.ok,
      raw: body,
    };
  },
};

export default adapter;
