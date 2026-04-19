

## Goal

Replace the single "Move to next status" button on each order card with **up to 5 status buttons** rendered along the bottom of the card. Clicking a button advances the order to that status (still updating the diner's mobile view via the existing realtime channel). Add an **"Active for Orders Display"** flag to the status setup so venues choose which statuses count as "Active" in the upper-right Active/All filter.

## Schema (1 migration)

Add to `venue_order_statuses`:
- `is_active_display bool not null default false` — when true, orders in this status appear under the "Active" filter on the Orders page

Backfill: seed defaults already inserted `received`, `preparing`, `ready` as the active working states → set `is_active_display = true` for those three on every existing venue. All others (`served`, `paid`, `cancelled`, `refunded`) stay false.

Update `seed_venue_order_statuses()` so newly created venues get the same defaults.

## UI changes

### `src/pages/OrderStatuses.tsx` (status setup)
- In the status row + the Add/Edit Status dialog, add a switch: **"Show in Active filter"** (writes `is_active_display`)
- Add a small column/label badge "Active" on rows where it's true
- Keep existing `is_terminal`, `is_default`, color, order, name, label fields

### `src/pages/Orders.tsx` (order card)
Replace the single `nextStatus` button with a **button row of up to 5 statuses**:

- Fetch `venue_order_statuses` for the venue once (sorted by `display_order`, `is_active = true`)
- For each card, render the first **5** statuses as buttons across the bottom
- The current status button is shown as `variant="default"` (highlighted); other buttons are `variant="outline"`
- Buttons before the current one are dimmed (`opacity-60`) but still clickable (allows correcting a misclick / going back, gated by `canUpdateOrderStatus`)
- Clicking a button calls the existing `updateStatus(orderId, status.name)` flow → already triggers the realtime channel that ConsumerOrder is subscribed to, so the diner's mobile view updates with no extra work
- Hide the entire button row when `!canUpdateOrderStatus`
- Terminal-status rows (already determined by `TERMINAL_STATUSES`) still show the OrderAgeBadge frozen and the existing Re-open & Refund button below the status row

**"Active" filter logic change:**
- Currently `filter === "active"` is hard-coded to `["received", "preparing", "ready"]`
- Change to: query the venue's `venue_order_statuses` where `is_active_display = true`, get those `name`s, and use them in the `.in("status", […])` clause
- Falls back to the hard-coded list if the venue somehow has none flagged (safety)

### Diner mobile view (`ConsumerOrder.tsx` / `OrderStatus.tsx`)
- No structural changes required — the diner already subscribes to `orders` realtime updates and re-renders on status change. Verify the displayed status label/timeline still matches the venue's active status set (the consumer's `OrderStatus` component uses a fixed 4-step visual; that's fine for v1, but ideally also driven by `venue_order_statuses` later — out of scope here)

## Constraints / behaviour

- Cap buttons at 5 — if a venue defines more, only the first 5 (by `display_order`) render on the card to keep the card clean. They can still set the rest as terminal or via the Re-open flow.
- Clicking the *current* status button is a no-op (button disabled).
- Mobile/responsive: button row uses `flex flex-wrap gap-1.5`; small `size="sm"` buttons with truncated labels.

## Files touched

- `supabase/migrations/<ts>_status_active_display.sql` — add column + backfill + update seed function
- `src/pages/OrderStatuses.tsx` — add "Show in Active filter" switch to status form/list
- `src/pages/Orders.tsx` — fetch statuses, render up-to-5-button row, drive Active filter from `is_active_display`
- `src/integrations/supabase/types.ts` — auto-regenerated

## Out of scope

- Driving the consumer-side `OrderStatus.tsx` timeline from `venue_order_statuses` (still hard-coded 4 steps for now)
- Per-Display-Area filtering of the button row (will combine with the KDS work later)
- Drag-to-reorder buttons on the card itself

## Expected result

- Manager opens **Order Display System** → toggles "Show in Active filter" on `received`, `preparing`, `ready` (default), turns it on for "Served" too if they want servers to keep working it.
- Manager opens **Orders** with the Active filter → sees orders in those flagged statuses only.
- Each order card shows up to 5 status buttons; tapping one advances the order, the diner's phone reflects the new status within ~1s via realtime.

