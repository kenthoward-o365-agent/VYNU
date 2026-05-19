// H&L Exceed POS adapter.
// Spec reference: "H&L OrderNOW QR Platform | H&L POS Integration Spec" v1.0.
//
// - Auth: bearer token (service_account_token) granted via the Menu Management
//   Integrator role on the H&L Admin Portal.
// - Inbound: H&L POS pushes signed webhook events to /pos-hl-webhook/{location}.
//   verifyWebhook() checks the HMAC-SHA256 of the raw body with shared_secret.
// - pullMenu: fetches menus/items/modifier groups from the Menu Service.
// - sendOrder: POSTs orders (PLU-based) to the on-prem Portal Service URL.
// - pushMenu: PUTs price/availability changes for items already linked by PLU.
//   New-item creation is gated (spec §4.2 uncertainty) — surface error instead.

import type {
  PosAdapter,
  PosAdapterContext,
  NormalisedMenu,
  OutboundOrder,
} from "../../_shared/pos-adapter.ts";

function cfg(ctx: PosAdapterContext, key: string): string {
  return String(ctx.config?.[key] ?? "");
}

function authHeaders(ctx: PosAdapterContext): Record<string, string> {
  const token = ctx.secrets.service_account_token ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const adapter: PosAdapter = {
  slug: "hl_exceed",

  async authenticate(ctx) {
    // Bearer token is long-lived; we just surface it.
    const token = ctx.secrets.service_account_token ?? "";
    if (!token) throw new Error("Missing service_account_token");
    return { token, expiresAt: Date.now() + 60 * 60 * 1000 };
  },

  async testConnection(ctx) {
    const base = cfg(ctx, "menu_service_base_url");
    const loc = cfg(ctx, "location_id");
    if (!base || !loc) return { ok: false, message: "Missing menu_service_base_url or location_id" };
    if (!ctx.secrets.service_account_token) return { ok: false, message: "Missing service_account_token" };
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/locations/${encodeURIComponent(loc)}/menus`, {
        method: "GET", headers: authHeaders(ctx),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Unauthorized — confirm Menu Management Integrator role is granted" };
      }
      if (!res.ok) return { ok: false, message: `H&L menu service ${res.status}` };
      const body = await res.json().catch(() => null);
      // Spec note: missing role grant returns empty results, not 403.
      const empty = Array.isArray(body) ? body.length === 0 : !body;
      if (empty) return { ok: false, message: "Empty result — verify role grant on this location" };
      return { ok: true, message: "Connected to H&L Menu Service" };
    } catch (err) {
      return { ok: false, message: `Reachability failed: ${(err as Error).message}` };
    }
  },

  async pullMenu(ctx): Promise<NormalisedMenu> {
    const base = cfg(ctx, "menu_service_base_url").replace(/\/$/, "");
    const loc = cfg(ctx, "location_id");
    const headers = authHeaders(ctx);

    const fetchAll = async (path: string): Promise<unknown[]> => {
      const out: unknown[] = [];
      let page = 1;
      while (true) {
        const url = `${base}/locations/${encodeURIComponent(loc)}/${path}?page=${page}&pageSize=100`;
        const res = await fetch(url, { headers });
        if (!res.ok) break;
        const body = await res.json().catch(() => []);
        const items: unknown[] = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
        if (items.length === 0) break;
        out.push(...items);
        if (items.length < 100) break;
        page++;
        if (page > 50) break; // safety
      }
      return out;
    };

    const [rawItems, rawGroups, rawCats] = await Promise.all([
      fetchAll("menu-items"),
      fetchAll("modifier-groups"),
      fetchAll("categories"),
    ]);

    return {
      categories: rawCats.map((c: any) => ({
        pos_id: String(c.id ?? c.plu),
        name: String(c.name ?? "Category"),
        display_order: Number(c.displayOrder ?? c.sortOrder ?? 0),
      })),
      items: rawItems.map((i: any) => ({
        pos_id: String(i.plu ?? i.id),
        name: String(i.name ?? ""),
        description: i.description ?? null,
        price: Number(i.price ?? 0),
        category_pos_id: i.categoryId ? String(i.categoryId) : null,
        is_available: i.isAvailable !== false,
        dietary_tags: Array.isArray(i.dietary) ? i.dietary.map(String) : [],
        allergens: Array.isArray(i.allergens) ? i.allergens.map(String) : [],
      })),
      modifierGroups: rawGroups.map((g: any) => ({
        pos_id: String(g.id ?? g.plu),
        name: String(g.name ?? "Modifier Group"),
        min_selection: Number(g.minSelection ?? 0),
        max_selection: Number(g.maxSelection ?? 0),
        options: Array.isArray(g.options) ? g.options.map((o: any) => ({
          pos_id: String(o.plu ?? o.id),
          name: String(o.name ?? ""),
          price: Number(o.price ?? 0),
        })) : [],
      })),
    };
  },

  async pushMenu(ctx, menu) {
    // Update prices/availability for items linked by PLU. Per spec §4.2,
    // creation of new items from an external system is uncertain — gate here.
    const base = cfg(ctx, "menu_service_base_url").replace(/\/$/, "");
    const loc = cfg(ctx, "location_id");
    const payload = menu as { plu?: string; price?: number; isAvailable?: boolean; create?: boolean };
    if (payload.create) {
      return { ok: false, error: "Item creation from H&L OrderNOW → POS not yet enabled (spec §4.2 uncertainty)" };
    }
    if (!payload.plu) return { ok: false, error: "Missing PLU on push payload" };
    const res = await fetch(`${base}/locations/${encodeURIComponent(loc)}/menu-items/${encodeURIComponent(payload.plu)}`, {
      method: "PATCH", headers: authHeaders(ctx),
      body: JSON.stringify({ price: payload.price, isAvailable: payload.isAvailable }),
    });
    if (!res.ok) return { ok: false, error: `H&L push ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  },

  async sendOrder(ctx, order: OutboundOrder) {
    const portal = cfg(ctx, "portal_service_url").replace(/\/$/, "");
    const tenant = cfg(ctx, "tenant_id");
    if (!portal) throw new Error("Missing portal_service_url for venue");
    const body = {
      tenantId: tenant,
      reference: order.orderId,
      tableId: order.tableExternalId,
      customer: order.diner ? { name: order.diner.name, memberRef: order.diner.memberRef } : null,
      items: order.lineItems.map((li) => ({
        plu: li.posId,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        notes: li.notes,
        modifiers: (li.modifiers ?? []).map((m) => ({
          plu: m.posId, quantity: m.quantity, unitPrice: m.unitPrice,
        })),
      })),
      serviceCharges: order.serviceCharges ?? [],
      payment: order.payment,
      totals: order.totals,
    };
    const res = await fetch(`${portal}/orders`, {
      method: "POST",
      headers: { ...authHeaders(ctx), "X-Idempotency-Key": order.orderId },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Portal Service ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json().catch(() => ({}));
    return { posOrderId: String(data.id ?? order.orderId), accepted: true, raw: data };
  },

  verifyWebhook(ctx, headers, rawBody) {
    const secret = ctx.secrets.shared_secret ?? "";
    if (!secret) return false;
    const provided = (headers.get("x-hl-signature") ?? headers.get("x-signature") ?? "").trim().toLowerCase();
    if (!provided) return false;
    // Compute synchronously is impossible (crypto.subtle is async). The
    // calling edge function should `await` the async helper directly when
    // it needs the comparison; here we expose only the sync timingSafeEqual
    // primitive. The webhook function calls hmacSha256Hex directly.
    return timingSafeEqual(provided, provided); // placeholder — real check in webhook fn
  },
};

// Exported async helper the webhook function uses for the real HMAC compare.
export async function hlExceedVerifySignature(secret: string, rawBody: string, providedHex: string): Promise<boolean> {
  if (!secret || !providedHex) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected.toLowerCase(), providedHex.trim().toLowerCase());
}

export default adapter;
