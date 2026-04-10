

# Remove "AI Features" Header + Add Menu Times Feature

## Overview
Three changes: (1) remove the non-functional "AI Features" header from the Menu Builder sidebar, (2) create a Menu Times system (Breakfast, Lunch, Dinner, etc.) under Pricing, and (3) allow each menu item to be assigned to menu times. Pricing rules will support three modifier modes: percentage change, dollar change, and fixed price override.

## What gets built

### 1. Remove "AI Features" label from sidebar
In `DashboardLayout.tsx`, remove the 4-line `<div>` block (lines 140–143) that renders the "AI Features" heading with the Sparkles icon. The sub-links (Import, Enhance Images, Modifiers) remain.

### 2. Database: `menu_time_frames` table
Stores venue-defined time frames (Breakfast, Lunch, Happy Hour, etc.):
- `id` uuid PK
- `venue_id` uuid FK → venues
- `name` text (e.g. "Breakfast")
- `start_time` time
- `end_time` time
- `days_of_week` int[] (0=Sun..6=Sat)
- `is_active` boolean default true
- `display_order` int default 0
- `created_at`, `updated_at` timestamptz

RLS: staff can view, managers can insert/update/delete (matching venue).

### 3. Database: `menu_item_time_frames` junction table
Links menu items to time frames:
- `id` uuid PK
- `menu_item_id` uuid FK → menu_items ON DELETE CASCADE
- `time_frame_id` uuid FK → menu_time_frames ON DELETE CASCADE
- UNIQUE(menu_item_id, time_frame_id)
- `created_at` timestamptz

RLS: staff can view, managers can insert/delete (via venue ownership).

### 4. Database: update `pricing_rules` table
Add two new columns:
- `modifier_type` text default 'percent' — values: 'percent', 'dollar', 'fixed'
- `modifier_value` numeric default 0 — the amount (percent %, dollar $, or fixed price $)

The existing `modifier_percent` column stays for backward compatibility; new rules use `modifier_type` + `modifier_value`.

### 5. New page: `src/pages/MenuTimes.tsx`
A CRUD interface under Pricing for managing time frames:
- List all time frames as cards showing name, time range, active days
- Add/edit dialog with name, start/end time, days-of-week selector
- Toggle active, delete
- Route: `/menu-times`

### 6. Update sidebar navigation
Under Pricing in `DashboardLayout.tsx`, add `hasSub: true` to the Pricing nav item and add a collapsible sub-item "Menu Times" linking to `/menu-times` with a Clock icon.

### 7. Update `MenuBuilder.tsx` item edit dialog
Add a "Menu Times" multi-select section in the item edit form:
- Fetch venue's active time frames
- Show checkboxes for each time frame
- On save, sync `menu_item_time_frames` junction table (delete existing, insert selected)

### 8. Update `Pricing.tsx` rule creation
Replace the single "Price modifier (%)" field with a modifier type selector:
- Dropdown: Percentage / Dollar Amount / Fixed Price
- Input label changes dynamically: "Modifier (%)" / "Amount ($)" / "Fixed price ($)"
- Store as `modifier_type` + `modifier_value` on the pricing rule
- Display on rule cards: "-15%", "+$2.00", or "$24.99 fixed"

## Files
- **Migration** — create `menu_time_frames`, `menu_item_time_frames` tables + RLS; add `modifier_type` and `modifier_value` columns to `pricing_rules`
- **Create** `src/pages/MenuTimes.tsx` — time frame CRUD page
- **Edit** `src/App.tsx` — add `/menu-times` route
- **Edit** `src/components/DashboardLayout.tsx` — remove "AI Features" header; add Menu Times sub-nav under Pricing
- **Edit** `src/pages/MenuBuilder.tsx` — add time frame selector to item edit dialog
- **Edit** `src/pages/Pricing.tsx` — add modifier type selector (%, $, fixed)

## Technical notes
- Items with no time frame assignments are available all day (backward compatible)
- Pricing rules with `modifier_type = 'fixed'` override the item's base price entirely during the active window
- Dollar modifier adds/subtracts a flat amount (e.g. +$2 or -$3)
- The `Sparkles` icon import can be removed from DashboardLayout if no longer used elsewhere

