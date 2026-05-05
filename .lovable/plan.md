# Shyndig Public API v1 — Plan

Build a branded public API that third-party POS vendors and CRM/loyalty partners can develop against. Modeled on **Deliverect** for POS (orders, menu, status, snooze) and **Sprout** for conventions (filtering syntax, scoped keys, versioning header).

**Decision locked**: POS and CRM credentials are **strictly separated**. A partner registered as `pos` can never mint CRM keys and never sees diner PII; a `crm` partner can never push order status or read order line items. This is enforced at the `api_partners.partner_type` level (no `both`) and double-enforced by scope whitelists on each function.

## Goals

1. POS vendors can integrate Shyndig themselves — read orders, push status, sync menus, snooze items.
2. CRM/loyalty vendors can read diner/visit data and push vouchers.
3. Each partner gets scoped credentials per venue; PII isolated by partner type.
4. A `/developers` docs page describes auth, resources, errors, webhooks.

## Non-goals (this phase)

- Self-serve partner signup portal (admin issues keys manually for v1).
- Public sandbox environment with seeded data.
- Official SDKs (REST + OpenAPI spec only).

---

## 1. Database

New tables (via migration):

- **`api_partners`** — `id`, `name`, `contact_email`, `partner_type` enum (`pos` | `crm` — **not both**), `is_active`, timestamps. A vendor that needs both surfaces registers as two separate partners.
- **`api_keys`** — `id`, `partner_id`, `venue_id` (nullable for group-level), `key_prefix` (visible, e.g. `sk_pos_live_abc123` or `sk_crm_live_xyz789`), `key_hash` (bcrypt), `scopes` (text[]), `last_used_at`, `revoked_at`, `created_by`, timestamps. Key prefix encodes type so misuse is obvious.
- **`api_webhooks`** — `id`, `partner_id`, `venue_id`, `url`, `events` (text[]), `secret`, `is_active`, `last_delivery_at`, `last_delivery_status`. Allowed events restricted by partner type.
- **`api_webhook_deliveries`** — `id`, `webhook_id`, `event_type`, `payload`, `response_status`, `attempt_count`, `next_retry_at`, `delivered_at`.
- **`api_idempotency`** — `(partner_id, key)` PK, `request_hash`, `response_status`, `response_body`, `created_at` (24h TTL).
- **`api_request_log`** — `id`, `partner_id`, `api_key_id`, `venue_id`, `method`, `path`, `status_code`, `latency_ms`, `request_id`, `created_at` (monthly partitioned, 30d retention).

Allowed scopes:
- POS: `orders:read`, `orders:write`, `status:write`, `menu:write`, `snooze:write`, `busy:write`.
- CRM: `diners:read`, `visits:read`, `vouchers:write`, `vouchers:read`.

DB function `verify_api_key(_prefix, _full_key) returns (partner_id, key_id, venue_id, partner_type, scopes)`. Returns NULL on revoked/expired/mismatched.

RLS: all `api_*` tables admin-only via `has_role(auth.uid(), 'tabless_admin')`. Edge functions use service role.

New column: `menu_items.snooze_until timestamptz` for POS snooze endpoint.

---

## 2. Edge functions

All under `supabase/functions/`, `verify_jwt = false` (auth done in code via Bearer key).

**Shared module** (`_shared/api-auth.ts`):
- `authenticate(req, expectedType: 'pos' | 'crm')` — extract Bearer key, verify, **reject if `partner_type` mismatches the function's expected type**, return context or 401/403.
- `requireScope(ctx, required)` — 403 if missing.
- `parseFilters(url)` — Sprout-style `field__gte=`, `field__in=a,b`, `sortBy=field:asc`, `page`, `pageSize`.
- `idempotencyCheck(req, partnerId)` — read `Idempotency-Key`, return cached response if duplicate.
- `logRequest(...)` — fire-and-forget insert into `api_request_log`.

**POS Partner endpoints** (`partner-pos` function, internal routing, only accepts `pos` keys):
- `GET   /v1/orders` — list with filters and pagination.
- `GET   /v1/orders/:id` — single order with items + modifiers + table number (no diner PII — only a stable `diner_handle` token).
- `PATCH /v1/orders/:id/status` — push status update; maps to `venue_order_statuses`.
- `POST  /v1/menu` — publish full menu snapshot; upserts `menu_categories`, `menu_items`, `modifier_groups` keyed by `plu`/`pos_id`.
- `PATCH /v1/products/:plu/snooze` — set `snooze_until`; auto-clears `is_available`.
- `PATCH /v1/locations/:venue_id/busy-mode` — adjust `extra_wait_minutes` venue-wide.

**CRM/Loyalty endpoints** (`partner-crm` function, internal routing, only accepts `crm` keys):
- `GET  /v1/contacts` — diner profiles where `marketing_consent = true`.
- `GET  /v1/contacts/:id` — single diner.
- `GET  /v1/contacts/:id/visits` — derived from `orders` (totals + dates only, **no line items** — those belong to POS).
- `POST /v1/vouchers` — issue voucher (loyalty redemption).
- `GET  /v1/vouchers/:id` — voucher status.

**Webhook dispatcher** (`partner-webhook-dispatch`):
- Triggered by DB-side enqueue on `orders` insert/update (POS events) and `loyalty_balances`/`diner_profiles` changes (CRM events).
- Routes events to webhooks of the matching partner type only.
- HMAC SHA-256 signs payload, POSTs, retries 1m/5m/30m/2h/12h on non-2xx.

---

## 3. Admin UI — Partner Management

New page `src/pages/AdminPartners.tsx` (linked from admin sidebar):

- **Partners tab**: list partners, **must select POS or CRM at creation (immutable)**, contact email, active toggle.
- **Keys tab**: per partner, issue scoped keys for specific venues. Scope picker is filtered to the partner's type. Show full key once on creation (modal + copy + warning), then only `key_prefix`. Revoke action.
- **Webhooks tab**: per partner+venue, register webhook URLs. Event picker filtered by partner type. View delivery log + retry/replay.
- **Request log**: searchable log of recent calls per partner (status, latency, path).

Gate: existing `tabless_admin` role.

---

## 4. Public docs page

New route `/developers` (public, no auth) — `src/pages/Developers.tsx`:

- Shyndig-branded layout (matches landing, not operator dark theme).
- Sections: Introduction, Authentication, Versioning, Rate limits, Errors, Idempotency, Filtering & Pagination, Webhooks.
- **Two clearly separated reference sections**: "POS API" and "CRM API", each with its own auth note explaining keys are not interchangeable.
- cURL + JS samples per endpoint.
- "Get API access" CTA → mailto for v1.

OpenAPI spec served from `/openapi.json` edge function (one combined spec, two tag groups).

---

## 5. API conventions (the style guide)

- **Base URL**: `https://api.shyndig.io/v1` (Phase 1: `https://<project>.supabase.co/functions/v1/partner-{pos|crm}/v1` until custom domain is set up).
- **Auth**: `Authorization: Bearer sk_pos_live_xxx` or `sk_crm_live_xxx`. Wrong-type key on wrong endpoint → `403 invalid_key_type`.
- **Versioning**: `Accept-Version: 1.0` header; URL `/v1` stays stable.
- **Pagination**: `?page=1&pageSize=50`; response `meta.totalCount/page/pageSize`.
- **Filtering**: `?status__in=received,preparing&created_at__gte=2026-05-01`.
- **Sorting**: `?sortBy=created_at:desc`.
- **Idempotency**: `Idempotency-Key: <uuid>` on POST/PATCH; 24h replay.
- **Errors**: `{ "error": { "code": "invalid_scope", "message": "...", "request_id": "..." } }`.
- **Rate limits**: 600 req/min per key; `X-RateLimit-Remaining` header.

---

## 6. Build order

1. Migration: 6 new tables + `verify_api_key` function + `partner_type` enum + `snooze_until` column on `menu_items`.
2. Shared `_shared/api-auth.ts` module with strict type-check.
3. `partner-pos` edge function (6 endpoints).
4. `partner-crm` edge function (5 endpoints).
5. Webhook dispatcher + cron tick for retries.
6. Admin UI: partners + keys + webhooks tabs.
7. `/developers` public docs page + `/openapi.json`.
8. Existing `pos-order-webhook` stays as-is (internal direct integrations); this is an additive partner-facing layer.

## Out of scope / future

- Self-serve developer signup, billing, usage dashboards.
- OAuth2 authorization-code flow for end-user-initiated installs.
- Sandbox environment with mock data.
- Official SDKs.