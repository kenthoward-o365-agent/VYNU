## Goal

1. Add a 10-minute idle timeout to the diner web app, with a "Still here?" modal grace period before the session closes.
2. Track diner-session lifecycle and cart abandonment as first-class events.
3. Surface the abandonment metric on the Venue Dashboard and the Shyndig admin panel.

## Data model

New table `diner_web_sessions` (one row per diner visit to a venue/table on the web app):

```
id                uuid pk
venue_id          uuid not null
table_id          uuid null
diner_id          uuid null            -- if signed in
session_mode      text null            -- solo / group
started_at        timestamptz default now()
last_activity_at  timestamptz default now()
ended_at          timestamptz null
end_reason        text null            -- 'ordered' | 'idle_timeout' | 'manual_close' | 'tab_closed'
first_add_to_cart_at  timestamptz null
reached_checkout_at   timestamptz null
order_placed_at       timestamptz null
order_id              uuid null
items_added_count     int default 0
cart_value_peak_cents int default 0
```

RLS:
- anon + authenticated INSERT (venue_id required)
- anon UPDATE by id (so the diner can patch their own row without auth)
- venue staff SELECT for their venue
- tabless_admin SELECT all

Index: `(venue_id, started_at desc)`, `(venue_id, end_reason)`.

Helper RPC `close_idle_web_sessions()` (SECURITY DEFINER):
- Marks any row with `ended_at IS NULL AND last_activity_at < now() - interval '15 minutes'` as `ended_at = now(), end_reason = 'idle_timeout'`. Safety net for tabs that died.

Cron: schedule every 5 minutes via `pg_cron` calling the RPC.

## Frontend — idle + lifecycle

New hook `src/hooks/use-diner-session.ts`:
- On mount: insert a `diner_web_sessions` row, store id in `sessionStorage` keyed by venue/table.
- Activity listeners: `pointerdown`, `keydown`, `scroll`, `visibilitychange` → debounced (15s) UPDATE of `last_activity_at`.
- Timer: 9 min of no activity → fire "Still here?" modal. 60s countdown. If user taps "I'm here", reset timer + bump `last_activity_at`. If countdown hits 0 or user taps "End session" → UPDATE row with `end_reason = 'idle_timeout'` (or `'manual_close'`), then call `onSessionEnd()`.
- `beforeunload` / `pagehide`: best-effort `navigator.sendBeacon` to a tiny edge function `web-session-ping` that sets `end_reason = 'tab_closed'` if still open.
- Expose helpers: `markAddToCart(value)`, `markCheckout()`, `markOrderPlaced(orderId)`.

New component `src/components/consumer/IdleTimeoutModal.tsx`:
- Centered modal, 60s ring countdown, two buttons: "I'm still here" (primary) / "End session".

Wire into `src/pages/ConsumerOrder.tsx`:
- Initialize hook with `{ venueId, tableId, dinerId, sessionMode }`.
- Call `markAddToCart` from existing `handleAddToCart`.
- Call `markCheckout` when `showCheckout` becomes true.
- Call `markOrderPlaced(orderId)` after a successful order insert.
- On `onSessionEnd`: clear cart, clear `lastOrderKey`, navigate back to `/v/:venueId/t/:tableId` landing.

## Edge function `web-session-ping`

Tiny POST endpoint that accepts `{ session_id, end_reason }` and updates the row using the service role. Used only for `sendBeacon` on tab-close. No auth required (anon-keyed); validates session_id is a uuid.

## Metrics views

SQL view `diner_session_metrics_daily`:

```
venue_id, day,
  sessions,
  sessions_with_cart       -- first_add_to_cart_at not null
  sessions_with_checkout   -- reached_checkout_at not null
  sessions_converted       -- order_placed_at not null
  cart_abandoned           -- with_cart and not converted
  checkout_abandoned       -- with_checkout and not converted
  cart_abandon_rate, checkout_abandon_rate, conversion_rate
```

RLS: venue staff SELECT for their venue, tabless_admin SELECT all.

## UI

**Venue Dashboard** (`src/pages/Dashboard.tsx`): new card "Cart abandonment (last 7 days)" — shows conversion rate, cart-abandon rate, checkout-abandon rate, and a small spark line of daily abandonment.

**Shyndig admin** (`src/pages/AdminDashboard.tsx`): new section "Platform funnel" — same metrics aggregated across all venues plus a per-venue table sortable by abandon rate.

Both pull from the new view via `supabase.from("diner_session_metrics_daily").select(...)`.

## Settings

Add a single venue setting `web_session.idle_minutes` (default 10) inside `venues.settings` jsonb so operators can tune it later — UI exposed in `VenueSettings → Table Sessions`. Modal countdown stays at 60s regardless.

## Out of scope

- Push/email "you left items behind" recovery (Phase 2).
- Multi-device session merging.
- Tracking abandonment for unauthenticated landing-page visitors who never opened the menu.

## Files

Created:
- `supabase/migrations/<ts>_diner_web_sessions.sql`
- `supabase/functions/web-session-ping/index.ts`
- `src/hooks/use-diner-session.ts`
- `src/components/consumer/IdleTimeoutModal.tsx`
- `src/components/dashboard/AbandonmentCard.tsx`
- `src/components/admin/PlatformFunnelCard.tsx`

Modified:
- `src/pages/ConsumerOrder.tsx` (wire hook)
- `src/pages/Dashboard.tsx` (add card)
- `src/pages/AdminDashboard.tsx` (add section)
- `src/components/venue/TableSessionsSettingsTab.tsx` (idle minutes input)
- Cron seeded via `insert` tool (not migration) since it includes the project URL + anon key.
