// VYNU CRM/Loyalty Partner API v1
// Bearer auth with sk_crm_* keys only. Strict separation from POS.
//
// Routes:
//   GET  /v1/contacts
//   GET  /v1/contacts/:id
//   GET  /v1/contacts/:id/visits
//   POST /v1/vouchers
//   GET  /v1/vouchers/:id

import {
  CORS, jsonResponse, errorResponse, getServiceClient,
  authenticate, requireScope, parseFilters, applyFilters,
  checkIdempotency, storeIdempotency, logRequest,
} from "../_shared/api-auth.ts";

const ALLOWED_CONTACT_FILTERS = ["created_at", "updated_at", "email"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();
  const supabase = getServiceClient();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/[^/]+/, "");

  const auth = await authenticate(req, supabase, "crm");
  if ("error" in auth) {
    logRequest(supabase, null, req.method, path, auth.error.status, startedAt);
    return auth.error;
  }
  const ctx = auth.ctx;

  if (req.method !== "GET") {
    const cached = await checkIdempotency(supabase, ctx.partner_id, req);
    if (cached) {
      logRequest(supabase, ctx, req.method, path, cached.status, startedAt);
      return cached;
    }
  }

  try {
    let res: Response;

    // GET /v1/contacts — diners visible to this venue (via diner_visits)
    if (req.method === "GET" && path === "/v1/contacts") {
      const scopeErr = requireScope(ctx, "diners:read");
      if (scopeErr) { res = scopeErr; }
      else if (!ctx.venue_id) res = errorResponse("venue_required", "Key must be venue-scoped", 400, ctx.request_id);
      else {
        const parsed = parseFilters(url);
        // diners who have visited this venue
        const { data: visitDiners } = await supabase
          .from("diner_visits")
          .select("diner_id")
          .eq("venue_id", ctx.venue_id);
        const dinerIds = [...new Set((visitDiners ?? []).map((v) => v.diner_id))];
        if (dinerIds.length === 0) {
          res = jsonResponse({ data: [], meta: { totalCount: 0, page: parsed.page, pageSize: parsed.pageSize } });
        } else {
          let q = supabase
            .from("diner_profiles")
            .select("id, first_name, last_name, email, phone, birthday, created_at, updated_at, allergens, preferences", { count: "exact" })
            .in("id", dinerIds);
          q = applyFilters(q, parsed, ALLOWED_CONTACT_FILTERS);
          const { data, error, count } = await q;
          if (error) res = errorResponse("query_failed", error.message, 500, ctx.request_id);
          else res = jsonResponse({ data, meta: { totalCount: count, page: parsed.page, pageSize: parsed.pageSize } });
        }
      }
    }

    // GET /v1/contacts/:id
    else if (req.method === "GET" && /^\/v1\/contacts\/[^/]+$/.test(path)) {
      const scopeErr = requireScope(ctx, "diners:read");
      if (scopeErr) { res = scopeErr; }
      else {
        const id = path.split("/")[3];
        // Confirm diner has visited this venue
        const { data: visit } = await supabase
          .from("diner_visits")
          .select("id")
          .eq("venue_id", ctx.venue_id!)
          .eq("diner_id", id)
          .limit(1).maybeSingle();
        if (!visit) res = errorResponse("not_found", "Contact not found for this venue", 404, ctx.request_id);
        else {
          const { data, error } = await supabase
            .from("diner_profiles")
            .select("id, first_name, last_name, email, phone, birthday, created_at, updated_at, allergens, preferences")
            .eq("id", id).maybeSingle();
          if (error) res = errorResponse("query_failed", error.message, 500, ctx.request_id);
          else if (!data) res = errorResponse("not_found", "Contact not found", 404, ctx.request_id);
          else res = jsonResponse({ data });
        }
      }
    }

    // GET /v1/contacts/:id/visits — totals + dates only, no line items
    else if (req.method === "GET" && /^\/v1\/contacts\/[^/]+\/visits$/.test(path)) {
      const scopeErr = requireScope(ctx, "visits:read");
      if (scopeErr) { res = scopeErr; }
      else {
        const id = path.split("/")[3];
        const parsed = parseFilters(url);
        let q = supabase
          .from("diner_visits")
          .select("id, visited_at, spend_excl_tax, points_awarded, order_id", { count: "exact" })
          .eq("diner_id", id);
        if (ctx.venue_id) q = q.eq("venue_id", ctx.venue_id);
        q = q.order("visited_at", { ascending: false })
          .range((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize - 1);
        const { data, error, count } = await q;
        if (error) res = errorResponse("query_failed", error.message, 500, ctx.request_id);
        else res = jsonResponse({ data, meta: { totalCount: count, page: parsed.page, pageSize: parsed.pageSize } });
      }
    }

    // POST /v1/vouchers — issue a loyalty reward
    else if (req.method === "POST" && path === "/v1/vouchers") {
      const scopeErr = requireScope(ctx, "vouchers:write");
      if (scopeErr) { res = scopeErr; }
      else {
        const body = await req.json().catch(() => ({}));
        const { diner_id, program_id, reward_kind, reward_payload, idempotency_key } = body;
        if (!diner_id || !program_id || !reward_kind) {
          res = errorResponse("invalid_body", "diner_id, program_id, reward_kind required", 400, ctx.request_id);
        } else {
          const { data, error } = await supabase
            .from("loyalty_rewards_issued")
            .insert({
              diner_id, program_id, reward_kind,
              reward_payload: reward_payload ?? {},
              idempotency_key: idempotency_key ?? req.headers.get("idempotency-key"),
            })
            .select().single();
          if (error) res = errorResponse("insert_failed", error.message, 500, ctx.request_id);
          else res = jsonResponse({ data }, 201);
        }
      }
    }

    // GET /v1/vouchers/:id
    else if (req.method === "GET" && /^\/v1\/vouchers\/[^/]+$/.test(path)) {
      const scopeErr = requireScope(ctx, "vouchers:read");
      if (scopeErr) { res = scopeErr; }
      else {
        const id = path.split("/")[3];
        const { data, error } = await supabase
          .from("loyalty_rewards_issued")
          .select("id, diner_id, program_id, reward_kind, reward_payload, issued_at, redeemed_at, redeemed_order_id")
          .eq("id", id).maybeSingle();
        if (error) res = errorResponse("query_failed", error.message, 500, ctx.request_id);
        else if (!data) res = errorResponse("not_found", "Voucher not found", 404, ctx.request_id);
        else res = jsonResponse({ data });
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
