

## Goal

Build **Operational Throttling** — per-Display-Area flood control that prevents the kitchen, bar, or any station from being overwhelmed during a rush. Mirrors Chewzie's "Smart Docket Queue" but built on our existing **Display Areas** (Kitchen, Bar, Take Away, Expo) instead of physical printers.

## What Chewzie does (the model we're copying)

Each printer/station has a queue with three modes:
- **Open** — orders flow straight through (normal trade)
- **Auto** — system holds new orders back when the station is at capacity, releases them at a configured rate (e.g. "5 orders per 10 minutes" = one every 2 minutes)
- **Block** — manual hold, dockets queue up but nothing releases until staff unblocks (auto-falls back to Auto after a timeout)

The queue auto-switches Open ↔ Auto based on current load. Wait time shown to the diner is automatically extended by `(queue_size × avg_per_order)` so the customer sees a realistic ETA. Wait times can also be manually overridden, and there's a **Test Mode** for safe tuning.

## How it maps to OrdrUp

| Chewzie | OrdrUp equivalent |
|---|---|
| Printer | **Display Area** (`venue_display_areas`) — already exists |
| Smart Docket Queue per printer | **Throttling config per Display Area** (new) |
| Docket released to printer | Order becomes **visible on the Display Terminal** for that area |
| Held in queue | Stays in `received` status, hidden from terminals until released |
| Customer sees +20m wait | Diner's `OrderStatus` view shows extended ETA |

We do NOT delay the order being placed or charged — we delay when it appears on the kitchen/bar Display Terminal. Diners see a realistic ETA up front.

## Schema (1 migration)

**`venue_display_areas`** — add throttling columns:
- `throttle_enabled bool default false`
- `throttle_mode text default 'open'` — `open` | `auto` | `block` | `test`
- `throttle_max_orders int default 5` — max orders per window in Auto
- `throttle_window_minutes int default 10` — the window length
- `throttle_block_timeout_minutes int default 15` — auto-revert from Block to Auto
- `throttle_block_until timestamptz` — set when manually blocked
- `throttle_show_wait_to_diner bool default true` — auto-adjust prep time
- `base_prep_time_minutes int default 15` — venue's normal completion time for this station

**`order_throttle_log`** — per-order audit (new table)
- `id`, `order_id`, `display_area_id`, `event` (`queued` | `released` | `blocked` | `bumped`), `queue_size_at_event int`, `wait_added_minutes int`, `created_at`

**`orders`** — add:
- `throttled_until timestamptz` — when this order should be released (NULL = released now). Used for filtering.
- `extra_wait_minutes int default 0` — adds to the diner-facing ETA

**Realtime**: Add `venue_display_areas` and `orders` to `supabase_realtime` publication so dashboard reflects mode changes instantly.

## Backend logic

### Edge function `throttle-tick` (cron, every 30s)
For each area where `throttle_enabled = true`:
1. Count orders currently routed to this area where `throttled_until > now()`
2. Auto-switch mode:
   - `open` → `auto` if queue size > `throttle_max_orders`
   - `auto` → `open` if queue empty for >2 min
   - `block` → `auto` if `throttle_block_until < now()`
3. For `auto` mode: release the next `throttle_max_orders / throttle_window_minutes` orders/minute by clearing their `throttled_until`
4. Recalculate `extra_wait_minutes` for each queued order = `position_in_queue × (window / max)`

### Trigger `apply_throttle_on_order_insert`
When an order is inserted, for each area its items route to:
- If area is `block`: set `throttled_until = throttle_block_until`, log `blocked`
- If area is `auto`: compute position in queue, set `throttled_until = now() + position × per_order_minutes`, log `queued`
- If area is `open`/`test` or throttle disabled: leave `throttled_until = null`, log nothing
- Pick the **latest** `throttled_until` across all routed areas (an order isn't "ready for kitchen" until all its stations can take it)
- Pick the **highest** `extra_wait_minutes` for diner display

### Test mode
`test`: behaves like `auto` for logging + `extra_wait_minutes` calculation, but `throttled_until` is always cleared so orders flow through immediately. Lets the manager observe behaviour without affecting service.

## UI changes

### New page `src/pages/OrderThrottling.tsx` (under "Order Display System")
For each Display Area, a card showing:
- Current mode pill (Open / Auto / Block / Test) with live queue count
- Mode toggle buttons: **Open**, **Auto**, **Block** (with timeout countdown), **Test**
- Inputs: max orders, window minutes, base prep time, "show wait to diner" switch
- Sparkline of last hour's queue size (from `order_throttle_log`)
- "Bump next" button — manually release the oldest queued order

### `src/components/orders/ThrottleStatusBar.tsx` (top of Orders page)
Shows a horizontal strip with each area's current mode + queue size, color-coded. Click an area → opens the throttle config drawer. Manager-only (gated by `canManageSettings`).

### `src/pages/Orders.tsx`
Filter visible orders by `throttled_until is null OR throttled_until <= now()` (so kitchen only sees what's been released). Show a small "+12m delay applied" badge on cards where `extra_wait_minutes > 0`.

### `src/components/consumer/OrderStatus.tsx`
Add `extra_wait_minutes` to the displayed ETA. Subtle "Kitchen is busy — extra ~12m wait" line if non-zero.

### `src/pages/KnowledgeBase.tsx`
New "Operational Throttling" section explaining the three modes, when to use Block (e.g. coffee machine breakdown), Test mode tuning, and how the diner ETA reflects load.

## Files touched

- `supabase/migrations/<ts>_operational_throttling.sql` — schema, trigger, realtime
- `supabase/functions/throttle-tick/index.ts` — new cron function
- `supabase/config.toml` — register cron schedule for `throttle-tick`
- `src/pages/OrderThrottling.tsx` — new manager page
- `src/components/orders/ThrottleStatusBar.tsx` — new
- `src/pages/Orders.tsx` — visibility filter + delay badge
- `src/pages/OrderStatuses.tsx` — add "Throttling" tab/link
- `src/components/consumer/OrderStatus.tsx` — extended ETA
- `src/pages/KnowledgeBase.tsx` — new section
- `src/integrations/supabase/types.ts` — auto-regenerated

## Out of scope (later)

- Per-item priority lanes (e.g. "kids meals always pass through")
- ML-based auto-tuning of `max_orders` / `window`
- SMS/email "your order is delayed" diner notifications
- Weekly throttle report PDF (Chewzie has this — easy follow-up)

## Expected result

- Friday 7pm rush: Kitchen area auto-flips to **Auto** at 6 queued orders → next diner sees "ETA 35 min" instead of 15 → kitchen receives one new order every ~2 min, never floods.
- Coffee machine breaks: barista taps **Block** on Bar area → all new drink orders queue, diner sees "Kitchen busy" → 15 min later auto-reverts to Auto and clears the backlog at controlled pace.
- Manager runs **Test Mode** for a week → reviews queue history → tunes `max_orders` from 5 → 7 based on real data.

