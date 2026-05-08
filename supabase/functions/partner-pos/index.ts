// H&L OrderNOW POS Partner API v1
// Bearer auth with sk_pos_* keys only. Strict separation from CRM.
//
// Routes (all under this function path):
//   GET   /v1/orders
//   GET   /v1/orders/:id
//   PATCH /v1/orders/:id/status        body: { status: "preparing" }
//   POST  /v1/menu                     body: { categories: [...], items: [...], modifiers: [...] }
//   PATCH /v1/products/:plu/snooze     body: { until: ISO8601 | null }
//   PATCH /v1/locations/:venue_id/busy-mode  body: { extra_wait_minutes: number }

import {
  CORS, jsonResponse, errorResponse, getServiceClient,
  authenticate, requireScope, parseFilters, applyFilters,
  checkIdempotency, storeIdempotency, logRequest,
} from "../_shared/api-auth.ts";

const ALLOWED_ORDER_FILTERS = ["status", "created_at", "venue_id", "table_id", "total"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();
  const supabase = getServiceClient();
  const url = new URL(req.url);

  // Strip the function-name segment so callers can use /v1/* uniformly.
  const path = url.pathname.replace(/^\/[^/]+/, "");

  const auth = await authenticate(req, supabase, "pos");
  if ("error" in auth) {
    logRequest(supabase, null, req.method, path, auth.error.status, startedAt);
    return auth.error;
  }
  const ctx = auth.ctx;

  // Idempotency on writes
  if (req.method !== "GET") {
    const cached = await checkIdempotency(supabase, ctx.partner_id, req);
    if (cached) {
      logRequest(supabase, ctx, req.method, path, cached.status, startedAt);
      return cached;
    }
  }

  try {
    let res: Response;

    // GET /v1/orders
    if (req.method === "GET" && path === "/v1/orders") {
      const scopeErr = requireScope(ctx, "orders:read");
      if (scopeErr) { res = scopeErr; }
      else {
        const parsed = parseFilters(url);
        let q = supabase
          .from("orders")
          .select("id, venue_id, table_id, status, total, subtotal, created_at, fired_at, throttled_until, extra_wait_minutes", { count: "exact" });
        if (ctx.venue_id) q = q.eq("venue_id", ctx.venue_id);
        q = applyFilters(q, parsed, ALLOWED_ORDER_FILTERS);
        const { data, error, count } = await q;
        if (error) res = errorResponse("query_failed", error.message, 500, ctx.request_id);
        else res = jsonResponse({
          data,
          meta: { totalCount: count, page: parsed.page, pageSize: parsed.pageSize },
        });
      }
    }

    // GET /v1/orders/:id
    else if (req.method === "GET" && /^\/v1\/orders\/[^/]+$/.test(path)) {
      const scopeErr = requireScope(ctx, "orders:read");
      if (scopeErr) { res = scopeErr; }
      else {
        const id = path.split("/")[3];
        let q = supabase
          .from("orders")
          .select("id, venue_id, table_id, status, total, subtotal, created_at, fired_at, throttled_until, extra_wait_minutes, customer_notes, order_items(id, quantity, unit_price, notes, modifiers, menu_items(id, name, plu, pos_id))")
          .eq("id", id);
        if (ctx.venue_id) q = q.eq("venue_id", ctx.venue_id);
        const { data, error } = await q.maybeSingle();
        if (error) res = errorResponse("query_failed", error.message, 500, ctx.request_id);
        else if (!data) res = errorResponse("not_found", "Order not found", 404, ctx.request_id);
        else res = jsonResponse({ data });
      }
    }

    // PATCH /v1/orders/:id/status
    else if (req.method === "PATCH" && /^\/v1\/orders\/[^/]+\/status$/.test(path)) {
      const scopeErr = requireScope(ctx, "status:write");
      if (scopeErr) { res = scopeErr; }
      else {
        const id = path.split("/")[3];
        const body = await req.json().catch(() => ({}));
        const allowed = ["received", "preparing", "ready", "served", "paid", "cancelled"];
        if (!allowed.includes(body.status)) {
          res = errorResponse("invalid_status", `status must be one of ${allowed.join(", ")}`, 400, ctx.request_id);
        } else {
          let q = supabase.from("orders").update({ status: body.status }).eq("id", id);
          if (ctx.venue_id) q = q.eq("venue_id", ctx.venue_id);
          const { error } = await q;
          if (error) res = errorResponse("update_failed", error.message, 500, ctx.request_id);
          else res = jsonResponse({ success: true, id, status: body.status });
        }
      }
    }

    // POST /v1/menu
    else if (req.method === "POST" && path === "/v1/menu") {
      const scopeErr = requireScope(ctx, "menu:write");
      if (scopeErr) { res = scopeErr; }
      else if (!ctx.venue_id) res = errorResponse("venue_required", "API key must be venue-scoped to publish menu", 400, ctx.request_id);
      else {
        const body = await req.json().catch(() => ({}));
        const { categories = [], items = [], modifiers = [] } = body;
        let upserted = { categories: 0, items: 0, modifiers: 0 };

        if (categories.length) {
          const rows = categories.map((c: { name: string; pos_id: string; display_order?: number }) => ({
            venue_id: ctx.venue_id, name: c.name, pos_id: c.pos_id, display_order: c.display_order ?? 0,
          }));
          const { error, count } = await supabase.from("menu_categories").upsert(rows, { onConflict: "venue_id,pos_id", count: "exact" });
          if (error) throw new Error(`categories: ${error.message}`);
          upserted.categories = count ?? rows.length;
        }
        if (items.length) {
          const rows = items.map((i: { name: string; plu?: string; pos_id?: string; price: number; description?: string; category_pos_id?: string; is_available?: boolean }) => ({
            venue_id: ctx.venue_id, name: i.name, plu: i.plu, pos_id: i.pos_id,
            price: i.price, description: i.description, is_available: i.is_available ?? true,
          }));
          const { error, count } = await supabase.from("menu_items").upsert(rows, { onConflict: "venue_id,plu", count: "exact" });
          if (error) throw new Error(`items: ${error.message}`);
          upserted.items = count ?? rows.length;
        }
        if (modifiers.length) {
          const rows = modifiers.map((m: { name: string; pos_id?: string; plu?: string; price?: number; category_id: string }) => ({
            venue_id: ctx.venue_id, name: m.name, pos_id: m.pos_id, plu: m.plu,
            price: m.price ?? 0, category_id: m.category_id,
          }));
          const { error, count } = await supabase.from("modifiers").upsert(rows, { onConflict: "venue_id,plu", count: "exact" });
          if (error) throw new Error(`modifiers: ${error.message}`);
          upserted.modifiers = count ?? rows.length;
        }
        res = jsonResponse({ success: true, upserted });
      }
    }

    // PATCH /v1/products/:plu/snooze
    else if (req.method === "PATCH" && /^\/v1\/products\/[^/]+\/snooze$/.test(path)) {
      const scopeErr = requireScope(ctx, "snooze:write");
      if (scopeErr) { res = scopeErr; }
      else {
        const plu = decodeURIComponent(path.split("/")[3]);
        const body = await req.json().catch(() => ({}));
        const until = body.until ?? null;
        const isAvailable = until === null;
        let q = supabase.from("menu_items").update({ snooze_until: until, is_available: isAvailable }).eq("plu", plu);
        if (ctx.venue_id) q = q.eq("venue_id", ctx.venue_id);
        const { error } = await q;
        if (error) res = errorResponse("update_failed", error.message, 500, ctx.request_id);
        else res = jsonResponse({ success: true, plu, snooze_until: until });
      }
    }

    // PATCH /v1/locations/:venue_id/busy-mode
    else if (req.method === "PATCH" && /^\/v1\/locations\/[^/]+\/busy-mode$/.test(path)) {
      const scopeErr = requireScope(ctx, "busy:write");
      if (scopeErr) { res = scopeErr; }
      else {
        const venueId = path.split("/")[3];
        if (ctx.venue_id && ctx.venue_id !== venueId) {
          res = errorResponse("venue_mismatch", "Key not authorised for this venue", 403, ctx.request_id);
        } else {
          const body = await req.json().catch(() => ({}));
          const minutes = Number(body.extra_wait_minutes ?? 0);
          const { error } = await supabase
            .from("orders")
            .update({ extra_wait_minutes: minutes })
            .eq("venue_id", venueId)
            .in("status", ["received", "preparing"]);
          if (error) res = errorResponse("update_failed", error.message, 500, ctx.request_id);
          else res = jsonResponse({ success: true, venue_id: venueId, extra_wait_minutes: minutes });
        }
      }
    }

    else {
      res = errorResponse("not_found", `No route for ${req.method} ${path}`, 404, ctx.request_id);
    }

    if (req.method !== "GET" && res.status < 400) {
      const bodyClone = await res.clone().json().catch(() => ({}));
      await storeIdempotency(supabase, ctx.partner_id, req, res.status, bodyClone);
    }
    logRequest(supabase, ctx, req.method, path, res.status, startedAt);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const r = errorResponse("internal_error", msg, 500, ctx.request_id);
    logRequest(supabase, ctx, req.method, path, 500, startedAt);
    return r;
  }
});
