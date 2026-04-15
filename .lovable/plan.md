

# OrdrUp API Integration — Gap Analysis and Implementation Plan

## What the API Document Covers

The uploaded OrdrUp API v1 document defines a comprehensive platform API across 12 domains: Authentication (OAuth M2M + HMAC webhooks), POS Integration, Commerce, Channels, Payments, Recommendations, Fulfillment/Delivery, Store Management, KDS (Kitchen Display), Gift Cards, Dispatch, and common data models.

## Current State vs. API Requirements

We already have the foundation: `venue_pos_integrations` table, `menu_source` toggle, `pos_id` on menu items/categories, and read-only mode in the Menu Builder. Here is what needs to change to support this API.

## Phase 1 — Core POS Menu Sync (Build Now)

This is the most immediately useful part: receiving product catalogs from POS partners and mapping orders back.

### 1. Database Schema Changes

**Extend `venue_pos_integrations`** with fields the API requires:
- `location_id` (text) — the OrdrUp `locationId` for this venue
- `account_id` (text) — the OrdrUp `accountId`
- `webhook_secret` (text) — for HMAC verification of inbound webhooks
- `client_id` / `client_secret_ref` — M2M OAuth credentials (secret ref, not actual value)
- `token_cache` (jsonb) — cached access token + expiry

**New table: `pos_sync_log`** — tracks every inbound sync event (product push, order status update) with timestamp, event type, payload hash, and result.

**Extend `menu_items`**:
- `plu` (text) — POS product lookup unit code (the API uses `plu` as the product identifier)
- `pos_allergens` (integer[]) — raw allergen IDs from POS (numeric codes per API spec)
- `pos_tags` (text[]) — raw tag names from POS

**Extend `menu_categories`**:
- `sort_order` (integer) — POS-provided sort order (distinct from our `display_order`)

### 2. Edge Function: `pos-product-sync`

**Inbound webhook** that POS partners call to push product catalogs.

Matches the API spec: `POST /pos/{locationId}/products`

- Accepts `{ products: [...], categories: [...] }` payload
- Verifies HMAC signature from `X-Signature` header
- Looks up venue by `location_id` in `venue_pos_integrations`
- Upserts categories by `categoryId` → `pos_id` match
- Upserts items by `plu` → `pos_id` match
- Maps allergen IDs and tags to our string arrays
- Logs sync result to `pos_sync_log`
- Updates `last_sync_at` and `sync_status` on `venue_pos_integrations`

### 3. Edge Function: `pos-order-webhook`

**Outbound order push** — when an order is created in our system, format it per the API spec and POST to the partner's webhook URL.

Also handles **inbound status updates**: `POST /pos/orders/{orderId}/status` — receives status code (1-7) from POS and updates our `orders.status` + `order_status_log`.

### 4. Edge Function: `pos-auth`

Handles M2M OAuth token acquisition and caching:
- `POST /oauth/token` with `client_credentials` grant
- Caches token in `venue_pos_integrations.token_cache`
- Auto-refreshes when expired
- Used by outbound API calls

### 5. Frontend: Integrations Settings Update

Extend `IntegrationsSettingsTab.tsx`:
- Add fields for `location_id` and `account_id`
- Show webhook URL that partners should configure (our edge function URL)
- Display `pos_sync_log` entries (last 10 syncs with status)
- "Sync Now" button that calls `GET {partnerBaseUrl}/products?locationId=...` to pull catalog

### 6. Frontend: Menu Builder POS Enhancements

- Show `plu` code on each item card in POS mode
- Show allergen/tag mapping status (POS codes mapped to our labels)
- Display last sync timestamp per item

## Phase 2 — Commerce & Orders (Build Next)

The Commerce API (baskets, checkout, fulfillment) maps to our existing order flow but needs:
- Basket management edge functions
- Channel link management
- Order status webhook handlers for partner notifications

## Phase 3 — Advanced Features (Future)

- **Store Management API**: Operating hours, busy mode, product snooze
- **KDS API**: Kitchen display integration
- **Gift Cards API**: Stored value provider integration
- **Dispatch API**: Delivery logistics
- **Recommendations API**: Already partially built with our upsell system

## Files Changed (Phase 1)

| File | Change |
|------|--------|
| Migration SQL | Extend `venue_pos_integrations`, `menu_items`, `menu_categories`; create `pos_sync_log` |
| `supabase/functions/pos-product-sync/index.ts` | New — inbound product catalog webhook |
| `supabase/functions/pos-order-webhook/index.ts` | New — order push + status updates |
| `supabase/functions/pos-auth/index.ts` | New — M2M OAuth token management |
| `src/components/venue/IntegrationsSettingsTab.tsx` | Add location ID, account ID, webhook URL display, sync log |
| `src/pages/MenuBuilder.tsx` | Show PLU codes, allergen mapping in POS mode |

## Technical Details

- **HMAC verification**: Every inbound webhook verifies `X-Signature` using `crypto.subtle.importKey` + `crypto.subtle.sign` in Deno
- **Price format**: API uses integer cents (e.g. 999 = $9.99) — matches our existing `price` column which stores cents
- **Allergen mapping**: API uses numeric IDs (1=Gluten, 2=Peanuts, etc.) — we store string labels; the sync function maps between them
- **Idempotency**: Product syncs use `plu`/`categoryId` as the merge key via upsert, preventing duplicates
- **Rate limits**: API allows 100 req/min for POS endpoints — our sync functions respect this

