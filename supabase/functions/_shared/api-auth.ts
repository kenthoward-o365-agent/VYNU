// Shared authentication, scope, filtering, idempotency, and logging helpers
// for the H&L OrderNOW Public API (POS + CRM partner surfaces).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key, accept-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

export type PartnerType = "pos" | "crm";

export interface AuthContext {
  partner_id: string;
  key_id: string;
  venue_id: string | null;
  partner_type: PartnerType;
  scopes: string[];
  request_id: string;
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(code: string, message: string, status: number, request_id?: string) {
  return jsonResponse({ error: { code, message, request_id } }, status);
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Authenticate the request using a Bearer API key.
 * Strict: rejects if the key's partner_type does not match `expectedType`.
 */
export async function authenticate(
  req: Request,
  supabase: SupabaseClient,
  expectedType: PartnerType,
): Promise<{ ctx: AuthContext } | { error: Response }> {
  const request_id = crypto.randomUUID();
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { error: errorResponse("missing_auth", "Authorization: Bearer <key> required", 401, request_id) };
  }
  const fullKey = auth.slice(7).trim();
  // prefix is everything before the last dot (e.g. sk_pos_live_abc123.SECRET)
  const dotIdx = fullKey.lastIndexOf(".");
  if (dotIdx < 0) {
    return { error: errorResponse("invalid_key", "Malformed API key", 401, request_id) };
  }
  const prefix = fullKey.slice(0, dotIdx);

  const { data, error } = await supabase.rpc("verify_api_key", {
    _prefix: prefix,
    _full_key: fullKey,
  });
  if (error || !data || data.length === 0) {
    return { error: errorResponse("invalid_key", "Invalid or revoked API key", 401, request_id) };
  }
  const row = data[0];
  if (row.partner_type !== expectedType) {
    return {
      error: errorResponse(
        "invalid_key_type",
        `This endpoint requires a ${expectedType.toUpperCase()} key, got ${row.partner_type.toUpperCase()}`,
        403,
        request_id,
      ),
    };
  }
  return {
    ctx: {
      partner_id: row.partner_id,
      key_id: row.key_id,
      venue_id: row.venue_id,
      partner_type: row.partner_type,
      scopes: row.scopes || [],
      request_id,
    },
  };
}

export function requireScope(ctx: AuthContext, scope: string): Response | null {
  if (!ctx.scopes.includes(scope)) {
    return errorResponse("invalid_scope", `Missing required scope: ${scope}`, 403, ctx.request_id);
  }
  return null;
}

export interface ParsedFilters {
  filters: Array<{ field: string; op: string; value: string | string[] }>;
  sortBy: { field: string; dir: "asc" | "desc" } | null;
  page: number;
  pageSize: number;
}

/**
 * Sprout-style filter syntax:
 *   ?status__in=a,b      -> { field: status, op: in, value: [a,b] }
 *   ?created_at__gte=... -> { field: created_at, op: gte, value: ... }
 *   ?sortBy=created_at:desc
 *   ?page=1&pageSize=50
 */
export function parseFilters(url: URL): ParsedFilters {
  const filters: ParsedFilters["filters"] = [];
  let sortBy: ParsedFilters["sortBy"] = null;
  let page = 1;
  let pageSize = 25;

  for (const [k, v] of url.searchParams.entries()) {
    if (k === "page") {
      page = Math.max(1, parseInt(v) || 1);
    } else if (k === "pageSize") {
      pageSize = Math.min(200, Math.max(1, parseInt(v) || 25));
    } else if (k === "sortBy") {
      const [field, dir] = v.split(":");
      sortBy = { field, dir: dir === "asc" ? "asc" : "desc" };
    } else if (k.includes("__")) {
      const [field, op] = k.split("__");
      const value = ["in", "nin"].includes(op) ? v.split(",") : v;
      filters.push({ field, op, value });
    } else if (!["sortBy", "page", "pageSize"].includes(k)) {
      filters.push({ field: k, op: "eq", value: v });
    }
  }
  return { filters, sortBy, page, pageSize };
}

const SUPABASE_OP_MAP: Record<string, string> = {
  eq: "eq", neq: "neq", gt: "gt", gte: "gte", lt: "lt", lte: "lte",
  in: "in", nin: "not.in", contains: "ilike",
};

/** Apply parsed filters to a Supabase query builder. Caller must whitelist fields. */
// deno-lint-ignore no-explicit-any
export function applyFilters(query: any, parsed: ParsedFilters, allowedFields: string[]) {
  for (const f of parsed.filters) {
    if (!allowedFields.includes(f.field)) continue;
    const op = SUPABASE_OP_MAP[f.op];
    if (!op) continue;
    if (f.op === "in") query = query.in(f.field, f.value);
    else if (f.op === "contains") query = query.ilike(f.field, `%${f.value}%`);
    else query = query.filter(f.field, op, f.value);
  }
  if (parsed.sortBy && allowedFields.includes(parsed.sortBy.field)) {
    query = query.order(parsed.sortBy.field, { ascending: parsed.sortBy.dir === "asc" });
  }
  const from = (parsed.page - 1) * parsed.pageSize;
  const to = from + parsed.pageSize - 1;
  query = query.range(from, to);
  return query;
}

/** Idempotency: returns cached response if same key seen for this partner in last 24h. */
export async function checkIdempotency(
  supabase: SupabaseClient,
  partnerId: string,
  req: Request,
): Promise<Response | null> {
  const key = req.headers.get("idempotency-key");
  if (!key) return null;
  const { data } = await supabase
    .from("api_idempotency")
    .select("response_status, response_body, created_at")
    .eq("partner_id", partnerId)
    .eq("key", key)
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .maybeSingle();
  if (data) {
    return jsonResponse(data.response_body, data.response_status, { "Idempotent-Replay": "true" });
  }
  return null;
}

export async function storeIdempotency(
  supabase: SupabaseClient,
  partnerId: string,
  req: Request,
  status: number,
  body: unknown,
) {
  const key = req.headers.get("idempotency-key");
  if (!key) return;
  const requestHash = await sha256(await req.clone().text().catch(() => ""));
  await supabase.from("api_idempotency").upsert({
    partner_id: partnerId,
    key,
    request_hash: requestHash,
    response_status: status,
    response_body: body as Record<string, unknown>,
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fire-and-forget request log. */
export function logRequest(
  supabase: SupabaseClient,
  ctx: AuthContext | null,
  method: string,
  path: string,
  status: number,
  startedAt: number,
) {
  const latency_ms = Date.now() - startedAt;
  supabase.from("api_request_log").insert({
    partner_id: ctx?.partner_id ?? null,
    api_key_id: ctx?.key_id ?? null,
    venue_id: ctx?.venue_id ?? null,
    method,
    path,
    status_code: status,
    latency_ms,
    request_id: ctx?.request_id ?? null,
  }).then(() => {}, () => {});
}
