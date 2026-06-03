// H&L Web Orders API client.
// Spec: https://developer.hlpos.com/reference/addorder
//
// - Auth: OAuth2 client_credentials → returns ~24h bearer
// - POST /api/order: create an order
// - GET  /api/order/{reference}: status lookup
// - Webhook HMAC: SHA-256 over raw body using shared_secret
//
// Token cache lives on venue_pos_integrations.token_cache:
//   { access_token, expires_at }
// Refresh 5 minutes before expiry.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PosAdapterContext, OutboundOrder } from "./pos-adapter.ts";

const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface HLOrderHeader {
  test: boolean;
  device_time: string;
  docket_no: number;
  serving_type: number;
  interface_type: number;
  integrator_id: number;
  recipient_id: number;
  reference: string;
  station_no: number;
  table_no?: number | null;
}

export interface HLSaleItem {
  plu: number | string;
  price: number;
  qty: number;
  description: string;
  modifier_items?: Array<{ plu: number | string; price: number; qty: number; description: string }>;
}

export interface HLTender {
  tendercode: number;
  amount: number;
  surcharge?: number;
  account_id?: string;
}

export interface HLOrderPayload {
  header: HLOrderHeader;
  sale_items: HLSaleItem[];
  tenders: HLTender[];
  customer?: { first_name?: string; mobile?: string } | null;
}

function cfg(ctx: PosAdapterContext, key: string, fallback?: unknown): unknown {
  const v = ctx.config?.[key];
  return v === undefined || v === null || v === "" ? fallback : v;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getHLToken(
  supabase: SupabaseClient,
  ctx: PosAdapterContext,
): Promise<{ access_token: string; expires_at: number }> {
  const cached = ctx.tokenCache as { access_token?: string; expires_at?: number } | null;
  if (cached?.access_token && cached.expires_at && cached.expires_at - Date.now() > REFRESH_SKEW_MS) {
    return { access_token: cached.access_token, expires_at: cached.expires_at };
  }

  const tokenUrl = String(cfg(ctx, "oauth_token_url", "https://auth.hlcloud.com.au/oauth/token"));
  const audience = String(cfg(ctx, "oauth_audience", "handl-production-api"));
  const clientId = ctx.secrets.client_id ?? "";
  const clientSecret = ctx.secrets.client_secret ?? "";
  if (!clientId || !clientSecret) throw new Error("Missing client_id / client_secret");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`H&L OAuth ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  const expires_at = Date.now() + (data.expires_in ?? 86400) * 1000;

  await supabase.from("venue_pos_integrations").update({
    token_cache: { access_token: data.access_token, expires_at },
  }).eq("venue_id", ctx.venueId);

  return { access_token: data.access_token, expires_at };
}

export function mapOutboundOrder(order: OutboundOrder, ctx: PosAdapterContext): HLOrderPayload {
  const testMode = cfg(ctx, "test_mode", true) !== false;
  const integrator_id = num(cfg(ctx, "integrator_id"));
  const recipient_id = num(cfg(ctx, "recipient_id"));
  const station_no = num(cfg(ctx, "station_no"));
  const serving_type = num(cfg(ctx, "serving_type", 0));
  const interface_type = num(cfg(ctx, "interface_type", 0));
  const default_tender_code = num(cfg(ctx, "default_tender_code", 63));

  const docket_no = Math.floor(Math.random() * 90000) + 10000;
  const table_no = order.tableExternalId ? num(order.tableExternalId, null as any) : null;

  const sale_items: HLSaleItem[] = order.lineItems.map((li) => ({
    plu: li.posId,
    price: Number(li.unitPrice),
    qty: Number(li.quantity),
    description: li.notes ?? "",
    modifier_items: (li.modifiers ?? []).map((m) => ({
      plu: m.posId,
      price: Number(m.unitPrice),
      qty: Number(m.quantity),
      description: "",
    })),
  }));

  // Tender selection:
  //  - table_no present → charge-to-table (empty tenders)
  //  - payment.method 'guest_charge' → code 15
  //  - payment.method 'debtor' → code 17 + account_id
  //  - else fast tender with default_tender_code (63 = card)
  let tenders: HLTender[] = [];
  if (table_no !== null && table_no !== undefined) {
    tenders = [];
  } else if (order.payment?.method === "guest_charge") {
    tenders = [{ tendercode: 15, amount: Number(order.payment.amount ?? order.totals.total) }];
  } else if (order.payment?.method === "debtor") {
    tenders = [{
      tendercode: 17,
      amount: Number(order.payment.amount ?? order.totals.total),
      account_id: order.payment.reference ?? "",
    }];
  } else {
    tenders = [{
      tendercode: default_tender_code,
      amount: Number(order.payment?.amount ?? order.totals.total),
    }];
  }

  return {
    header: {
      test: testMode,
      device_time: new Date().toISOString(),
      docket_no,
      serving_type,
      interface_type,
      integrator_id,
      recipient_id,
      reference: order.orderId,
      station_no,
      ...(table_no !== null && table_no !== undefined ? { table_no } : {}),
    },
    sale_items,
    tenders,
    customer: order.diner?.name
      ? { first_name: order.diner.name, mobile: order.diner.memberRef ?? "" }
      : null,
  };
}

export async function postOrder(
  supabase: SupabaseClient,
  ctx: PosAdapterContext,
  payload: HLOrderPayload,
): Promise<{ status: number; body: unknown }> {
  const token = await getHLToken(supabase, ctx);
  const base = String(cfg(ctx, "web_orders_base_url", "https://weborders.hlcloud.com.au/api/order"));
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as text */ }
  if (!res.ok) {
    throw new Error(`H&L POST order ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, body };
}

export async function getOrder(
  supabase: SupabaseClient,
  ctx: PosAdapterContext,
  reference: string,
): Promise<{ status: number; body: unknown }> {
  const token = await getHLToken(supabase, ctx);
  const base = String(cfg(ctx, "web_orders_base_url", "https://weborders.hlcloud.com.au/api/order"))
    .replace(/\/$/, "");
  const res = await fetch(`${base}/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as text */ }
  return { status: res.status, body };
}

// ---- HMAC verification (webhook) ---------------------------------------

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

export async function verifyHLSignature(
  secret: string,
  rawBody: string,
  providedHex: string,
): Promise<boolean> {
  if (!secret || !providedHex) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected.toLowerCase(), providedHex.trim().toLowerCase());
}
