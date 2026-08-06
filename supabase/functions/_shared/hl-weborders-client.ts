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
import { PosDataError } from "./pos-adapter.ts";
import type { PosAdapterContext, OutboundOrder, UnmappedLine } from "./pos-adapter.ts";

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

// plu is `integer` in the H&L schema; keep it numeric here so a stringly-typed
// posId cannot reach the wire again (it was accepted as `number | string` before
// and H&L rejected the order with a 400).
// `description` is the product name H&L prints on the docket and is required on
// both items and modifiers. Line-level notes belong in the separate optional
// `comment` field — sending them as the description replaced the product name.
export interface HLSaleItem {
  plu: number;
  price: number;
  qty: number;
  description: string;
  comment?: string;
  modifier_items?: Array<{ plu: number; price: number; qty: number; description: string }>;
}

// account_id is an integer in the addorder spec, not a string.
export interface HLTender {
  tender_code: number;
  amount: number;
  surcharge?: number;
  account_id?: number;
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

/**
 * "YYYY-MM-DD HH:MM:SS" in UTC, the format the addorder spec documents for
 * device_time / required_date_time. toISOString() was being sent instead, which
 * H&L has accepted so far, but nothing guarantees it keeps doing so.
 */
function hlDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * PLU sent for a line we cannot address to a real Exceed product. Sysnet
 * recognises it as "needs manual attention" and routes the line accordingly.
 */
export const UNMAPPED_PLU = 0;

/**
 * A line's PLU, falling back to UNMAPPED_PLU and recording the line when it
 * cannot address a real product.
 *
 * pos-outbound-worker resolves posId as `plu || pos_id || ""`, so an unmapped
 * menu item arrives as "". This previously threw, which failed the whole order:
 * one unmapped garnish meant the kitchen got nothing at all. Sysnet handles the
 * placeholder downstream, so the order is worth more delivered than rejected.
 *
 * The substitution is never silent: every fallback is pushed onto `unmapped`,
 * which the worker records against the order and the sync log. Sending 0 with no
 * trace would be the worse failure of the two — a schema-valid order quietly
 * pointing at the wrong product, which is exactly what REQUIRED_ID_KEYS guards
 * against in the header. `where` mirrors H&L's own validation paths so ours and
 * theirs can be read side by side.
 */
function resolvePlu(
  posId: unknown,
  where: string,
  description: string,
  unmapped: UnmappedLine[],
): number {
  const n = num(posId, NaN);
  if (!Number.isInteger(n) || n <= 0) {
    unmapped.push({ where, description, posId });
    return UNMAPPED_PLU;
  }
  return n;
}

/** Identifiers an order needs in order to address a real Exceed site. */
const REQUIRED_ID_KEYS = ["integrator_id", "recipient_id", "station_no"] as const;

/**
 * Returns the required identifier keys that are absent or non-numeric.
 *
 * num() coerces a missing value to 0, so without this check an incompletely
 * configured venue produces a structurally valid order addressed to nobody — H&L
 * either rejects it or routes the docket nowhere, with no error at our end. An
 * explicit 0 is left alone: that is an operator's choice, not a missing value.
 */
export function missingOrderIds(ctx: PosAdapterContext): string[] {
  return REQUIRED_ID_KEYS.filter((k) => {
    const raw = ctx.config?.[k];
    if (raw === undefined || raw === null) return true;
    const v = typeof raw === "string" ? raw.trim() : raw;
    if (v === "") return true;
    const n = typeof v === "number" ? v : Number(v);
    return !Number.isFinite(n);
  });
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

/** A mapped order plus any lines that fell back to UNMAPPED_PLU. */
export interface MappedOrder {
  payload: HLOrderPayload;
  unmapped: UnmappedLine[];
}

export function mapOutboundOrder(order: OutboundOrder, ctx: PosAdapterContext): MappedOrder {
  // Fail loudly rather than sending header ids of 0 (see missingOrderIds).
  // Unlike an unmapped line this is not survivable: with no recipient the order
  // reaches no venue at all, so there is nothing for Sysnet to reconcile.
  const missing = missingOrderIds(ctx);
  if (missing.length > 0) {
    throw new PosDataError(
      `H&L configuration incomplete for this venue: ${missing.join(", ")} not set`,
    );
  }

  const unmapped: UnmappedLine[] = [];

  const testMode = cfg(ctx, "test_mode", true) !== false;
  const integrator_id = num(cfg(ctx, "integrator_id"));
  const recipient_id = num(cfg(ctx, "recipient_id"));
  const station_no = num(cfg(ctx, "station_no"));
  const serving_type = num(cfg(ctx, "serving_type", 0));
  const interface_type = num(cfg(ctx, "interface_type", 0));
  const default_tender_code = num(cfg(ctx, "default_tender_code", 63));

  const docket_no = Math.floor(Math.random() * 90000) + 10000;
  const table_no = order.tableExternalId ? num(order.tableExternalId, null as any) : null;

  const sale_items: HLSaleItem[] = order.lineItems.map((li, i) => {
    const itemName = li.name?.trim() || `Item ${i + 1}`;
    return {
      plu: resolvePlu(li.posId, `sale_items[${i}]`, itemName, unmapped),
      price: Number(li.unitPrice),
      qty: Number(li.quantity),
      description: itemName,
      ...(li.notes ? { comment: li.notes } : {}),
      modifier_items: (li.modifiers ?? []).map((m, j) => {
        const modName = m.name?.trim() || `Modifier ${j + 1}`;
        return {
          plu: resolvePlu(
            m.posId,
            `sale_items[${i}].modifier_items[${j}]`,
            `${modName} (on ${itemName})`,
            unmapped,
          ),
          price: Number(m.unitPrice),
          qty: Number(m.quantity),
          description: modName,
        };
      }),
    };
  });

  // Tender selection:
  //  - table_no present → charge-to-table (empty tenders)
  //  - payment.method 'guest_charge' → code 15
  //  - payment.method 'debtor' → code 17 + account_id
  //  - else fast tender with default_tender_code (63 = card)
  let tenders: HLTender[] = [];
  if (table_no !== null && table_no !== undefined) {
    tenders = [];
  } else if (order.payment?.method === "guest_charge") {
    tenders = [{ tender_code: 15, amount: Number(order.payment.amount ?? order.totals.total) }];
  } else if (order.payment?.method === "debtor") {
    // account_id is optional to H&L but typed as an integer, so an absent
    // reference means omit the key (as with customer) rather than fail the order.
    // A reference that is present but non-numeric is a real data problem: num()
    // would coerce it to 0 and charge whichever account that is.
    const rawRef = order.payment.reference;
    const ref = typeof rawRef === "string" ? rawRef.trim() : rawRef;
    const accountId = ref === null || ref === undefined || ref === "" ? null : num(ref, NaN);
    if (accountId !== null && !Number.isInteger(accountId)) {
      throw new PosDataError(
        `H&L: debtor account_id must be numeric (got ${JSON.stringify(rawRef)})`,
      );
    }
    tenders = [{
      tender_code: 17,
      amount: Number(order.payment.amount ?? order.totals.total),
      ...(accountId !== null ? { account_id: accountId } : {}),
    }];
  } else {
    tenders = [{
      tender_code: default_tender_code,
      amount: Number(order.payment?.amount ?? order.totals.total),
    }];
  }

  const payload: HLOrderPayload = {
    header: {
      test: testMode,
      device_time: hlDateTime(new Date()),
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
    // Omitted rather than nulled, matching table_no above. customer is optional
    // to H&L, but an explicit null is not: it rejects the order with
    // "customer - NULL value found, but an object is required". Only
    // pos-hl-test-order supplies a diner name, so the null branch never ran in
    // testing while every real table order failed with a 400.
    ...(order.diner?.name
      ? { customer: { first_name: order.diner.name, mobile: order.diner.memberRef ?? "" } }
      : {}),
  };

  return { payload, unmapped };
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
    const msg = `H&L POST order ${res.status}: ${text.slice(0, 300)}`;
    // A 4xx means H&L understood us and refused this order — our payload is
    // wrong, and retrying it unchanged will fail identically. Only genuine
    // availability problems (5xx, timeouts, rate limiting) should count towards
    // the circuit breaker. 408/429 are the two 4xx that are worth retrying.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new PosDataError(msg);
    }
    throw new Error(msg);
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

/**
 * Connectivity probe for the Web Orders host.
 *
 * testConnection only ever reached the identity provider, so a wrong (or
 * production-vs-sandbox mismatched) web_orders_base_url passed the test and only
 * failed on the first real order. This performs the documented
 * GET /api/order/{reference} lookup with a throwaway reference: any HTTP answer
 * proves DNS/TLS/host and that the bearer is accepted, and a 404 for an unknown
 * reference is a pass. It creates nothing.
 */
export async function probeWebOrders(
  supabase: SupabaseClient,
  ctx: PosAdapterContext,
): Promise<{ ok: boolean; message: string }> {
  const base = String(cfg(ctx, "web_orders_base_url", "https://weborders.hlcloud.com.au/api/order"));
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return { ok: false, message: `Web Orders base URL is not a valid absolute URL: ${base}` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: `Web Orders base URL must be http(s): ${base}` };
  }

  try {
    const res = await getOrder(supabase, ctx, "connectivity-check");
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Web Orders rejected the token (${res.status}) — check the OAuth audience for this environment`,
      };
    }
    if (res.status >= 500) {
      return { ok: false, message: `Web Orders returned ${res.status} at ${parsed.host}` };
    }
    return { ok: true, message: `Web Orders reachable at ${parsed.host} (${res.status})` };
  } catch (err) {
    return { ok: false, message: `Web Orders unreachable at ${parsed.host}: ${(err as Error).message}` };
  }
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
