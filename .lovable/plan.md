

## Goal

Restructure the modifier UI on the diner Item Detail screen so:

1. **Required categories** appear expanded at the top (auto-prompt the diner).
2. **Optional categories** appear collapsed below, each shown as a compact row with a leading **+** icon — tapping expands the category to reveal its modifiers.
3. Venue managers can **drag-reorder optional categories per menu item** in the Modifiers admin.

## Behavior changes (diner UI)

**Order on screen** (top → bottom):
1. Hero, title, price, quantity (unchanged)
2. **Required categories** — fully expanded, with a small "Required" pill next to the heading. Validation already blocks "Add to Order" until satisfied (unchanged logic).
3. **Optional categories** — collapsed by default. Each renders as:
   ```text
   ┌────────────────────────────────────────────┐
   │ [+]  Add-ons              max 3        ›  │
   └────────────────────────────────────────────┘
   ```
   Tap → expands inline, the `+` rotates to `×`, modifier list slides down. Tap again to collapse.
   - Once any modifier in the group is selected, the row stays expanded and shows the count badge (e.g. `2/3`) instead of just `+`.
   - The leading icon is the existing `Plus` lucide icon (rotates to close on expand).

**Section heading** for required categories changes from the current uppercase sub-label to a small red `Required` badge next to the category name. Optional categories drop the "Add-ons / Choose / No-Hold" sub-label until expanded (then it appears below the heading inside the expanded panel, same as today).

**Ordering**: categories sort by:
- required first (stable, by existing `display_order`)
- then optional, by the new per-item `display_order` (falls back to category's own `display_order` if null)

## Behavior changes (operator admin — Modifiers page)

In the existing per-item assignment UI (where a venue ticks which categories apply to a menu item and toggles "required"):
- Add a **drag handle** (`GripVertical`) next to each assigned category row.
- Drag to reorder — persists to the new `display_order` column on `menu_item_modifiers`.
- A small helper line: *"This is the order optional categories appear to diners."*

Required categories in the diner UI ignore this order (they always come first); the venue can still drag them but it only affects optional ordering on the diner side. (Simpler than splitting the list.)

## Database

Add one column:
- `menu_item_modifiers.display_order` — `integer not null default 0`
- Backfill: set `display_order` based on current row order per `menu_item_id` (using `row_number()` over `created_at`).
- No new RLS — existing policies cover the column.

## Files to change

- **DB migration** — add `display_order` to `menu_item_modifiers` + backfill.
- **`src/components/consumer/ItemDetailScreen.tsx`** — split required vs optional, collapse-by-default optional groups with `+` toggle, fetch & sort by per-item `display_order`.
- **`src/pages/Modifiers.tsx`** — add drag-to-reorder on the per-item assignment list (using `@dnd-kit` already common in the project, or simple up/down arrows if dnd-kit isn't installed — will check and pick one consistent with the codebase).

## Out of scope

- Reordering the modifiers *within* a category (already handled by `modifiers.display_order` in the existing Modifiers admin).
- Any change to kitchen ticket / receipt rendering.
- Required categories being collapsible (always expanded so diners see them immediately, per the request).

## Expected result

- Diner opens a burger →  
  *"Choose your bun"* (required, expanded, must pick 1) →  
  Below it: `[+] Add-ons   max 3 ›` and `[+] No / Hold ›` collapsed rows →  
  Tap `+ Add-ons` → expands, lists Bacon / Cheese / Avocado → pick Bacon → row now shows `1/3` and stays open.
- Venue manager opens the burger's modifier assignments → drags "Add-ons" above "No / Hold" → diners now see Add-ons first.

