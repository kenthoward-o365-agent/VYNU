
## Gap analysis: H&L POS spec vs. what we have today

Our POS framework (`venue_pos_integrations` + `pos_providers` + adapter loader in `supabase/functions/_shared/pos-adapter.ts`) was designed around **Doshii's model**: one outbound JWT-authed cloud API, pull-style. H&L POS (Exceed) is a different shape and needs four pieces the current framework doesn't cover.

| H&L POS requirement | Have today? | Gap |
|---|---|---|
| Adapter abstraction, breaker, secrets in Vault | ✅ `pos-adapter.ts`, `pos-context.ts`, `read/set_pos_credential` | None |
| Per-venue config + onboarding UI | ✅ `PosConnectDialog`, `admin-set-pos-credentials` | Add H&L-specific fields |
| **Inbound webhook receiver** (H&L POS pushes menu-change events to us, HMAC-signed) | ❌ Doshii is pull-only — no inbound signed-webhook endpoint exists | New public edge function |
| **Scheduled + on-demand menu pull** from H&L Menu Management cloud | Partial — adapter has `pushMenu` but no `pullMenu` | Add `pullMenu` to adapter interface |
| **Order push to on-prem Portal Service** (per-venue URL, PLU-based payload) | Partial — adapter has no `sendOrder`; orders today go via `pos-outbound-worker` to Doshii | Add `sendOrder` to adapter; H&L impl |
| **Reverse menu sync** (H&L OrderNOW → POS) with approval queue | ❌ No approval-queue table or UI | New table + UI tab |
| Two-direction sync toggles per venue | ❌ | Add toggles to `venue_pos_integrations` |
| Idempotency, dedupe by event id, replay protection | Partial — `api_idempotency` exists for inbound API | Reuse for webhook dedupe |
| Backup printing fallback when POS unreachable | ✅ Display terminals exist as fallback path | Wire failure → terminal route |

The architecture stays — H&L POS becomes one more adapter slug. The new pieces (webhook receiver, scheduled menu sync, sendOrder) are general additions that also benefit future adapters.

## Plan

### 1. Extend the POS framework (provider-agnostic)

- Add to `PosAdapter` interface in `_shared/pos-adapter.ts`:
  - `pullMenu(ctx)` → returns normalised menu snapshot
  - `sendOrder(ctx, order)` → returns `{ posOrderId, accepted }`
  - `verifyWebhook(ctx, headers, rawBody)` → boolean (HMAC check)
- Register slug `hl_exceed` in the `KNOWN` loader map.

### 2. New schema (migration)

- `pos_providers` row: `{ slug: "hl_exceed", name: "H&L Exceed POS", config_schema: [...] }` with fields:
  - secrets: `shared_secret`, `service_account_token`
  - config: `organisation_id`, `tenant_id` (venueId on their side), `location_id`, `menu_service_base_url`, `subscription_service_base_url`, `portal_service_url` (on-prem, per venue), `fail_notification_email`
- Add columns to `venue_pos_integrations`:
  - `sync_pos_to_us boolean default true`
  - `sync_us_to_pos boolean default false`
  - `last_menu_pull_at timestamptz`, `last_webhook_at timestamptz`
- New table `pos_menu_change_queue` (approval queue for our→POS pushes): venue_id, menu_item_id, pos_id, payload jsonb, status (`pending|approved|sent|failed`), created_at, reviewed_by, error.
- New table `pos_webhook_events` (dedupe + audit): venue_id, event_id (unique), topic, received_at, processed_at, signature_valid, raw jsonb.

### 3. H&L Exceed adapter (`supabase/functions/adapters/hl_exceed/index.ts`)

- `authenticate` — bearer token from `secrets.service_account_token` against H&L Menu Management
- `testConnection` — GET `{menu_service_base_url}/locations/{location_id}` and assert non-empty
- `pullMenu` — paginated GET of menu items, modifier groups, dietary, item↔modifier links; normalise into our schema with `pos_id` = PLU
- `pushMenu` — PUT linked items to POS (price/availability/modifiers only; new-item creation gated behind feature flag per spec §4.2 uncertainty)
- `sendOrder` — POST to `portal_service_url` with PLU-based line items, table id, charges, member discount
- `verifyWebhook` — HMAC-SHA256 of raw body with `shared_secret`, constant-time compare

### 4. New edge functions

- **`pos-hl-webhook`** (public, `verify_jwt = false` — H&L POS calls it directly)
  - URL pattern: `/pos-hl-webhook/{our_location_id}`
  - Steps: load integration by our_location_id → verify HMAC via adapter → insert into `pos_webhook_events` (unique event_id dedupes retries) → ack 200 immediately → enqueue `jobs_pos_outbound` job `{ kind: "menu_pull", venue_id }`
- **`pos-menu-pull`** (scheduled + on-demand)
  - Called by cron (hourly) and by webhook-triggered job
  - Loads adapter, calls `pullMenu`, upserts into `menu_items`/`menu_categories`/modifiers by `pos_id`
- **`pos-menu-push`** (worker for our→POS direction)
  - Reads `pos_menu_change_queue` where status = `approved`, calls `adapter.pushMenu`, marks sent/failed
- Extend existing **`pos-outbound-worker`** to dispatch `kind: "send_order"` → `adapter.sendOrder`, with fallback to print terminal on failure

### 5. Operator UI

- New tab in venue Settings → POS: **H&L Pay-style "H&L POS" panel** with:
  - Connection fields (org id, tenant id, location id, base URLs, portal URL, shared secret, service token)
  - Sync direction toggles (POS→us, us→POS)
  - "Test connection" button → calls `pos-test-connection`
  - "Sync menu now" button → calls `pos-menu-pull`
  - Onboarding checklist showing: our identifiers to share with H&L, status of role grant, status of subscription, last webhook received
- New admin page **Pending Menu Changes** listing `pos_menu_change_queue` items with approve/reject

### 6. Documentation + onboarding values

- Generate per-venue **integration sheet** showing the three values H&L POS needs from us: `client_id`, `our_location_id`, fully-formed `callbackUrl` (`https://jsbxivkgfekcgvtyqnek.supabase.co/functions/v1/pos-hl-webhook/{our_location_id}`)
- Document in `KnowledgeBase.tsx` under a new "H&L POS Integration" section

### Out of scope (per spec §1)

- Pickup, delivery, counter ordering (table-only for v1)
- New-item creation from H&L OrderNOW → POS (flagged uncertain in spec §4.2; ship update-only, add create later)
- Member discount lookup against POS Order Service (separate follow-up; spec §10)

### Technical notes

- Webhook endpoint is the only new **public** edge function; everything else is service-role
- Idempotency: `pos_webhook_events.event_id` unique constraint + 24h cleanup via existing `purge_api_idempotency` pattern
- All H&L secrets stored via existing `set_pos_credential` RPC → Vault; nothing in plain config
- Backup printing already exists via `display_terminals` — `sendOrder` failure path enqueues the order to the terminal queue so the kitchen still gets it
