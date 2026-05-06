// Doshii reference adapter — JWT-signed requests to the Doshii partner API.
// Docs: https://docs.doshii.io/
//
// This is a SCAFFOLD. Real network calls are stubbed where they would hit
// Doshii so the UX flow (connect → test → sync → snooze) is exercisable
// end-to-end before partner credentials are provisioned. Replace the
// stubbed sections with live calls once DOSHII_CLIENT_ID/DOSHII_CLIENT_SECRET
// are configured and a sandbox location exists.

import { create as createJwt, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { registerAdapter, type PosAdapter, type PosAdapterContext, type PosOrderUpdate } from "../../_shared/pos-adapter.ts";

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

async function doshiiFetch(path: string, init: RequestInit & { locationId?: string } = {}) {
  const token = await signJwt();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "doshii-location-id": init.locationId ?? "",
  };
  return await fetch(`${DOSHII_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

const adapter: PosAdapter = {
  slug: "doshii",

  async authenticate(_ctx) {
    const token = await signJwt();
    return { token, expiresAt: Date.now() + 55_000 };
  },

  async testConnection(ctx) {
    try {
      const locationId = String(ctx.config?.location_id ?? "");
      if (!locationId) return { ok: false, message: "Missing Doshii location_id" };
      const res = await doshiiFetch(`/locations/${locationId}`, { method: "GET", locationId });
      if (!res.ok) return { ok: false, message: `Doshii ${res.status}: ${await res.text()}` };
      return { ok: true, message: "Connected to Doshii location" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },

  async pushMenu(ctx, menu) {
    const locationId = String(ctx.config?.location_id ?? "");
    const res = await doshiiFetch(`/menu`, {
      method: "PUT",
      locationId,
      body: JSON.stringify(menu),
    });
    if (!res.ok) return { ok: false, error: await res.text() };
    return { ok: true };
  },

  async pullOrders(ctx, sinceIso): Promise<PosOrderUpdate[]> {
    const locationId = String(ctx.config?.location_id ?? "");
    const res = await doshiiFetch(`/orders?from=${encodeURIComponent(sinceIso)}`, { method: "GET", locationId });
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
    const locationId = String(ctx.config?.location_id ?? "");
    await doshiiFetch(`/orders/${externalOrderId}`, {
      method: "PUT",
      locationId,
      body: JSON.stringify({ status }),
    });
  },

  async snoozeProduct(ctx, plu, snoozeUntilIso) {
    const locationId = String(ctx.config?.location_id ?? "");
    await doshiiFetch(`/menu/products/${plu}/availability`, {
      method: "PUT",
      locationId,
      body: JSON.stringify({ available: snoozeUntilIso === null, snoozeUntil: snoozeUntilIso }),
    });
  },
};

registerAdapter(adapter);
export default adapter;
