// Doshii reference adapter — JWT-signed requests to the Doshii partner API.
// Credentials come from Vault (resolved by pos-context.buildContext()) and
// arrive on ctx.secrets.location_token. Global app credentials still come
// from env (DOSHII_CLIENT_ID/SECRET) since they're shared across venues.

import { create as createJwt, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import type { PosAdapter, PosAdapterContext, PosOrderUpdate } from "../../_shared/pos-adapter.ts";

const DOSHII_BASE = "https://sandbox.doshii.co/partner/v3";

async function signJwt(): Promise<string> {
  const clientId = Deno.env.get("DOSHII_CLIENT_ID");
  const clientSecret = Deno.env.get("DOSHII_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Doshii credentials not configured (DOSHII_CLIENT_ID/SECRET)");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await createJwt(
    { alg: "HS256", typ: "JWT" },
    { clientId, iat: getNumericDate(0), exp: getNumericDate(60) },
    key,
  );
}

async function doshiiFetch(locationId: string, path: string, init: RequestInit = {}) {
  const token = await signJwt();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "doshii-location-id": locationId,
  };
  return await fetch(`${DOSHII_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

function locId(ctx: PosAdapterContext): string {
  return String(ctx.config?.location_id ?? "");
}

const adapter: PosAdapter = {
  slug: "doshii",

  async authenticate(_ctx) {
    const token = await signJwt();
    return { token, expiresAt: Date.now() + 55_000 };
  },

  async testConnection(ctx) {
    const locationId = locId(ctx);
    if (!locationId) return { ok: false, message: "Missing Doshii location_id" };
    const res = await doshiiFetch(locationId, `/locations/${locationId}`, { method: "GET" });
    if (!res.ok) return { ok: false, message: `Doshii ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, message: "Connected to Doshii location" };
  },

  async pushMenu(ctx, menu) {
    const res = await doshiiFetch(locId(ctx), `/menu`, { method: "PUT", body: JSON.stringify(menu) });
    if (!res.ok) return { ok: false, error: await res.text() };
    return { ok: true };
  },

  async pullOrders(ctx, sinceIso): Promise<PosOrderUpdate[]> {
    const res = await doshiiFetch(locId(ctx), `/orders?from=${encodeURIComponent(sinceIso)}`, { method: "GET" });
    if (!res.ok) return [];
    const body = await res.json().catch(() => []) as Array<Record<string, unknown>>;
    return body.map((o) => ({
      externalOrderId: String(o.id),
      status: String(o.status ?? "unknown"),
      updatedAt: String(o.updatedAt ?? new Date().toISOString()),
      raw: o,
    }));
  },

  async updateOrderStatus(ctx, externalOrderId, status) {
    await doshiiFetch(locId(ctx), `/orders/${externalOrderId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  },

  async snoozeProduct(ctx, plu, snoozeUntilIso) {
    await doshiiFetch(locId(ctx), `/menu/products/${plu}/availability`, {
      method: "PUT",
      body: JSON.stringify({ available: snoozeUntilIso === null, snoozeUntil: snoozeUntilIso }),
    });
  },
};

export default adapter;
