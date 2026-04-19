

## Goal

Extend the planned **Display Areas** feature so each menu category and each menu item can route to **up to 3 Display Areas** (e.g. an item goes to *Fry Side* and *Expo* simultaneously). Items still inherit from their category by default, and can override with their own 1–3 areas.

## Schema (revised from previous plan)

Drop the single `display_area_id` columns idea. Use **junction tables** so the cap is enforced and queries stay clean.

1. **`venue_display_areas`** (unchanged from prior plan)
   - `id`, `venue_id`, `name`, `description`, `color`, `display_order`, `is_active`, `is_default`, timestamps
   - Unique `(venue_id, name)`; staff SELECT, manager write (RLS mirrors `venue_order_statuses`)
   - Auto-seed trigger inserts: Kitchen (default), Bar, Take Away, Expo

2. **`menu_category_display_areas`** (new junction)
   - `id`, `category_id` → `menu_categories(id) ON DELETE CASCADE`
   - `display_area_id` → `venue_display_areas(id) ON DELETE CASCADE`
   - Unique `(category_id, display_area_id)`
   - **Trigger `enforce_max_3_category_areas`** — `BEFORE INSERT` raises if the category already has 3 rows
   - RLS: manager write, staff SELECT (joined through `menu_categories.venue_id`)

3. **`menu_item_display_areas`** (new junction)
   - `id`, `menu_item_id` → `menu_items(id) ON DELETE CASCADE`
   - `display_area_id` → `venue_display_areas(id) ON DELETE CASCADE`
   - Unique `(menu_item_id, display_area_id)`
   - **Trigger `enforce_max_3_item_areas`** — same 3-row cap
   - RLS: manager write, staff SELECT

**Resolution rule** (in app code): if an item has rows in `menu_item_display_areas` → use those (override). Otherwise fall back to the parent category's rows. If neither, fall back to the venue's `is_default = true` area.

## UI

### `src/pages/OrderStatuses.tsx`
Add a **Display Areas** card above Statuses (CRUD, color, reorder, set-default, active toggle) — same pattern as Statuses.

### `src/pages/MenuBuilder.tsx`
Replace the planned single-select with a **multi-select chip picker** (max 3) on both forms:

- **Category form** — "Display Areas" picker. Selected areas shown as colored chips with × to remove. Add-button disabled at 3.
- **Item form** — "Display Areas" picker with two modes:
  - "Inherit from category (Kitchen, Expo)" — default; writes 0 rows to `menu_item_display_areas`
  - "Override" — opens the same chip picker (max 3); writes to `menu_item_display_areas`
- In the item list, render up to 3 colored area badges per item showing the *effective* areas (override or inherited).

Client-side enforces the cap of 3 with a friendly toast; the DB trigger is the safety net.

## Files touched

- `supabase/migrations/<timestamp>_add_display_areas_multi.sql` — new table + 2 junction tables + 2 cap-enforcement triggers + seed trigger + backfill for existing venues
- `src/pages/OrderStatuses.tsx` — add Display Areas card
- `src/pages/MenuBuilder.tsx` — multi-select (max 3) on category & item editors, effective-area badges in list
- `src/integrations/supabase/types.ts` — auto-regenerated
- `.lovable/memory/features/schema.md` — note new tables and the 3-area cap rule

## Out of scope (follow-ups)

- Splitting Orders / KDS view per Display Area (will use these junction rows once it exists)
- Per-area printer routing
- Per-area sound alerts

## Expected result

- Manager creates "Fry Side" and "Expo" in Display Areas.
- On a "Loaded Fries" item, sets override → picks **Fry Side + Expo** (2 of 3 chips). Picker prevents adding a 4th.
- Inherited items still show the category's areas as colored badges in the menu list.
- Schema is ready for a future KDS PR to fan out a single order line to multiple station screens.

