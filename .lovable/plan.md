
## Goal

Re-target our H&L integration to the actual **H&L Web Orders API** (`https://weborders.hlcloud.com.au/api/order`) using documented OAuth2 client-credentials auth, and implement both **POST order** (send) and **GET order** (status lookup). Build against the spec now; sandbox credentials can be plugged in per venue later. After this lands, we'll review triggers/settings (auto-push on order insert, status reconciliation).

---

## Confirmed decisions

1. **Build blind against the spec** — no live sandbox creds yet. All HTTP calls behind a venue-level "POS push enabled" flag, default **off**, and a `test: true` flag in the H&L header until real creds are wired.
2. **`integrator_id` / `recipient_id` / `station_no` are per-venue** — captured in the connect dialog via `pos_providers.config_schema`.
3. **Default tender code = 63 (card)** for fast-tender orders. When the order has a `table_no`, send `tenders: []` (charge-to-table mode).

---

## Spec recap (what we're building to)

**Auth** — `POST https://auth.hlcloud.com.au/oauth/token` (sandbox: `handl-sandbox.au.auth0.com`)
- Body: `{ client_id, client_secret, audience, grant_type: "client_credentials" }`
- Returns: `{ access_token, token_type, expires_in (~86400), scope }`

**Send order** — `POST https://weborders.hlcloud.com.au/api/order` with `Authorization: Bearer …`
```
{
  "header": { test, device_time, docket_no, serving_type, interface_type,
              integrator_id, recipient_id, reference, station_no, table_no? },
  "sale_items": [ { plu, price, qty, description, modifier_items: [...] } ],
  "tenders":    [ { tendercode, amount, surcharge?, account_id? } ],
  "customer":   { first_name, mobile }
}
```
Four order modes — fast tender / charge to table / guest charge (code 15) / debtor charge (code 17 + account_id).

**Get order** — by `reference` (UUID we send). Used for status reconciliation alongside webhooks.

---

## Implementation

### 1. Shared client — `supabase/functions/_shared/hl-weborders-client.ts`
Single source of truth. Exports:
- `getHLToken(ctx)` — OAuth2 client-credentials call; caches `access_token` + `expires_at` in `venue_pos_integrations.token_cache` (refresh 5 min before expiry).
- `mapOutboundOrder(order, ctx)` — converts our `OutboundOrder` → H&L payload. Branches:
  - `tableExternalId` present → `header.table_no` set, `tenders: []`
  - else → fast tender using `default_tender_code` (63) and `payment.amount`
  - `payment.method === 'guest_charge'` → `tendercode: 15`
  - `payment.method === 'debtor'` → `tendercode: 17, account_id`
- `postOrder(ctx, payload)` — POST with bearer token, returns `{ status, body }`.
- `getOrder(ctx, reference)` — GET status by reference.
- `verifyHLSignature(secret, rawBody, hex)` — HMAC-SHA256 (move the working helper out of the adapter file).

### 2. Rewrite `supabase/functions/adapters/hl_exceed/index.ts`
- `authenticate()` → `getHLToken()` (returns token + expiresAt).
- `sendOrder()` → `mapOutboundOrder` + `postOrder`; returns `{ posOrderId: reference, accepted, raw }`.
- `testConnection()` → try `getHLToken()`; success = creds valid. Drop the obsolete Menu Service / Portal Service URL checks.
- `verifyWebhook()` → delegate to `verifyHLSignature`.
- Remove `pullMenu` / `pushMenu` for now (this spec doesn't expose menu endpoints publicly) — leave a stub returning empty so existing callers don't crash.

### 3. New edge function — `supabase/functions/pos-hl-order-get/index.ts`
- Verifies JWT, checks `is_venue_manager`.
- Body: `{ venue_id, order_id }`. Loads order → `pos_order_id` (= our reference UUID) → `adapter.getOrder()` → logs to `pos_sync_log`, returns H&L status.
- Used by operator "Refresh from POS" button.

### 4. New edge function — `supabase/functions/pos-hl-test-order/index.ts`
- Manager-only. Builds a hard-coded test payload (`test: true`, fake PLU, $0.01) and calls `postOrder`. Returns full request/response for the connect dialog's "Send test order" button.

### 5. Update `pos-outbound-worker`
- On successful `send_order`, enqueue a deferred `pull_order_status` job (~60s later) as a safety net if the webhook is missed.

### 6. Migration — `supabase/migrations/<ts>_hl_weborders_config.sql`
- Update `pos_providers` row where `slug = 'hl_exceed'` with new `config_schema`:
  - `oauth_token_url` (text, default `https://auth.hlcloud.com.au/oauth/token`)
  - `oauth_audience` (text, default `handl-production-api`)
  - `web_orders_base_url` (text, default `https://weborders.hlcloud.com.au/api/order`)
  - `integrator_id` (number, required) — per-venue
  - `recipient_id` (number, required) — per-venue
  - `station_no` (number, required) — per-venue
  - `default_tender_code` (number, default 63)
  - `serving_type` (number, default 0)
  - `interface_type` (number, default 0)
  - **Secrets:** `client_id`, `client_secret`, `shared_secret` (webhook HMAC)
- Add `token_cache jsonb` column on `venue_pos_integrations` if missing.

### 7. UI — `src/components/venue/HLPosPanel.tsx`
- Render the new config fields (integrator_id, recipient_id, station_no, default tender).
- "Send test order" button → `pos-hl-test-order`, shows request/response JSON.
- Status pill: latest `pos_sync_log` entry for `outbound_send_order`.

### 8. `supabase/config.toml`
- Register `pos-hl-order-get` and `pos-hl-test-order` (default — JWT required).

---

## Out of scope (next iteration — triggers & settings review)

After this lands and we've smoke-tested against H&L sandbox:
- `venue_pos_integrations.auto_push_orders` boolean.
- DB trigger on `orders` insert → enqueue `send_order` when flag is on.
- Per-order "Push to POS" / "Refresh from POS" buttons on the Orders page.
- Webhook → status reconciliation refinement against H&L's real event topics.

---

## Files

**New**
- `supabase/functions/_shared/hl-weborders-client.ts`
- `supabase/functions/pos-hl-order-get/index.ts`
- `supabase/functions/pos-hl-test-order/index.ts`
- migration: update `pos_providers` for `hl_exceed`, add `token_cache` column

**Edited**
- `supabase/functions/adapters/hl_exceed/index.ts`
- `supabase/functions/pos-hl-webhook/index.ts` (use shared verifier)
- `supabase/functions/pos-outbound-worker/index.ts` (deferred status-pull)
- `src/components/venue/HLPosPanel.tsx`
- `supabase/config.toml`
