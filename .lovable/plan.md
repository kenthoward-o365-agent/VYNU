# Plan: Outbound POS Integrations Hub + Doshii Reference Adapter

Build the management surface and reference implementation for **outbound** POS connections — the side where Shyndig builds adapters to vendor APIs (Doshii, H&L Exceed, Lightspeed, Square, etc.). This is the counterpart to `/admin/partners` (inbound, where third parties build to our spec).

## 1. Provider Registry (new table)

New table `pos_providers` — the catalogue of every POS Shyndig has built an adapter for.

Columns: `id`, `slug` (e.g. `doshii`, `hl_exceed`, `lightspeed`, `square`), `name`, `logo_url`, `auth_type` (`oauth2` | `api_key` | `hmac`), `capabilities` (jsonb: `{menu_push, menu_pull, orders_push, orders_pull, snooze, payments, loyalty}`), `config_schema` (jsonb describing what credentials each venue must supply), `webhook_url_template`, `docs_url`, `status` (`alpha`|`beta`|`ga`|`deprecated`), `is_active`.

Seeded rows: `doshii` (GA reference), `hl_exceed` (alpha), `lightspeed` (alpha), `square` (alpha), `mock` (for dev/testing).

Admin-only RLS for write; readable by venue managers (so settings UI can render the catalogue).

## 2. Extend `venue_pos_integrations`

Add columns:
- `provider_id uuid references pos_providers(id)` — replaces ad-hoc string identifiers
- `connection_status` (`disconnected`|`connecting`|`connected`|`error`)
- `last_sync_at`, `last_sync_status`, `last_error`
- `config jsonb` — provider-specific (e.g. Doshii `locationId`)
- Keep existing `client_id`, `client_secret_ref`, `endpoint_url`, `token_cache`

Backfill existing rows to point at correct `provider_id`.

## 3. `/admin/integrations` (new page)

Three tabs:

**a. Providers** — Grid of registry cards (logo, capabilities chips, status badge, docs link). Admin can toggle `is_active` and edit metadata.

**b. Connections** — Cross-venue table:
```text
Venue            Provider     Status      Last sync    Actions
─────────────────────────────────────────────────────────────
The Local Bar    Doshii       Connected   2m ago       View · Sync · Disconnect
Surf Club        H&L Exceed   Error       1h ago       View · Reconnect
Beach Cafe       —            —           —            Connect…
```
Filters: provider, status, group. "Connect…" opens provider picker → credential form (driven by `config_schema`) → test connection → save.

**c. Activity** — Tail of `pos_sync_log` (new table: timestamped sync events, errors, payload sizes per venue/provider) for debugging.

Add nav link **POS Integrations** (icon `Cable`) in admin sidebar, below **API Partners**.

## 4. Refactor venue-side `IntegrationsSettingsTab`

Currently shows hard-coded provider buttons. Replace with:
- Read enabled providers from `pos_providers`
- Render dynamic credential form from `config_schema`
- "Test connection" button calls new `pos-test-connection` edge fn
- Show capability chips so the venue manager knows what will sync

Venue managers can self-serve connect/disconnect; admins can do it on their behalf from `/admin/integrations`.

## 5. Doshii reference adapter

Doshii is the cleanest Aussie POS aggregator (covers Lightspeed, Impos, Idealpos, etc.) — building the adapter once gives us multi-POS reach. Use it as the canonical pattern for all future adapters.

**Edge functions** (new `supabase/functions/adapters/doshii/`):
- `auth.ts` — JWT signing with Doshii client secret (stored as Supabase secret `DOSHII_CLIENT_SECRET`)
- `menu-push.ts` — POST our `menu_items` (with `plu`) → Doshii `/menu`
- `orders-poll.ts` — pulls order updates (cron, 30s)
- `orders-webhook.ts` — receives Doshii webhooks (order accepted/rejected/ready), updates our `orders` table
- `snooze.ts` — toggles availability via Doshii product API

Wire into existing `pos-product-sync` and `pos-order-webhook` as the dispatch target when `provider.slug === 'doshii'`.

**Adapter contract** (so future providers slot in cleanly): each adapter exports `{ authenticate, pushMenu, pullOrders, updateOrderStatus, snoozeProduct }`. The generic `pos-*` functions look up the provider and call the matching adapter module.

## 6. Secret storage

Per-venue secrets (e.g. each venue's Doshii location token) stored via `client_secret_ref` pointing at a Supabase secret name like `DOSHII_VENUE_<uuid>`. Shared vendor app credentials (Shyndig's Doshii client ID/secret) stored once as `DOSHII_CLIENT_ID` / `DOSHII_CLIENT_SECRET`.

Admin UI surfaces "Set credential" buttons that call `admin-set-pos-credentials` edge fn (mirrors existing `admin-set-payment-credentials` pattern) — never round-trips secrets to the browser.

## 7. Out of scope (next phases)

- Square / Lightspeed / H&L Exceed concrete adapters (scaffolded only)
- Two-way menu reconciliation UI (drift detection between our menu and POS)
- Per-provider analytics dashboards

## Technical summary

**New files**
- `src/pages/AdminIntegrations.tsx` (3-tab page)
- `src/components/admin/integrations/{ProvidersTab,ConnectionsTab,ActivityTab,ConnectVenueDialog,ProviderConfigForm}.tsx`
- `supabase/functions/adapters/doshii/{auth,menu-push,orders-poll,orders-webhook,snooze}.ts`
- `supabase/functions/_shared/pos-adapter.ts` (adapter contract + dispatcher)
- `supabase/functions/pos-test-connection/index.ts`
- `supabase/functions/admin-set-pos-credentials/index.ts`

**Migrations**
- Create `pos_providers` + RLS, seed 5 rows
- Create `pos_sync_log` + RLS
- Alter `venue_pos_integrations` (add provider_id, status, config, sync metadata)

**Modified**
- `src/components/DashboardLayout.tsx` (add nav link)
- `src/components/venue/IntegrationsSettingsTab.tsx` (dynamic provider rendering)
- `src/App.tsx` (route)
- `supabase/functions/pos-product-sync/index.ts` & `pos-order-webhook/index.ts` (dispatch via adapter contract)

**Secrets to request after approval**
- `DOSHII_CLIENT_ID`, `DOSHII_CLIENT_SECRET` (one-off, shared)

## Question

Doshii sandbox credentials — do you already have a Doshii partner account, or should I scaffold the adapter against their public sandbox docs and we wire real creds when you sign up?
