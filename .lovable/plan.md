

# Pricing Rules — Menu Item Targeting

## Overview
Add the ability to select which menu items a pricing rule applies to. Currently rules apply to the entire menu. This change lets venues target specific items (e.g. Happy Hour on drinks only, or a promo on a specific dish).

## What gets built

### 1. Database: new `pricing_rule_items` junction table
A many-to-many table linking pricing rules to menu items:
- `id` (uuid, PK)
- `pricing_rule_id` (uuid, FK → pricing_rules.id ON DELETE CASCADE)
- `menu_item_id` (uuid, FK → menu_items.id ON DELETE CASCADE)
- `created_at` (timestamptz)
- Unique constraint on (pricing_rule_id, menu_item_id)
- RLS: staff can view, managers can insert/delete (matching venue ownership)

If no rows exist for a rule, it applies to all items (backward compatible).

### 2. UI: item selector in the Add Rule dialog
- Fetch the venue's menu items (grouped by category) when the dialog opens
- Add an "Applies to" section with two modes: "All items" (default) and "Selected items"
- When "Selected items" is chosen, show a scrollable checklist of items grouped by category with checkboxes
- Selected items stored in form state and inserted into `pricing_rule_items` after the rule is created

### 3. UI: show targeted items on rule cards
- Fetch associated items when loading rules (join through `pricing_rule_items`)
- Display item count on the rule card: "All items" or "3 items" with a tooltip/expandable list showing the names

### 4. Editing support
- When deleting a rule, cascade handles cleanup automatically
- Toggle and delete flows remain unchanged

## Files
- **Migration** — create `pricing_rule_items` table with RLS
- **Edit** `src/pages/Pricing.tsx` — add item selector UI in dialog, fetch menu items, display targeted items on cards

## Technical notes
- Junction table approach keeps `pricing_rules` schema clean and supports many-to-many
- Categories fetched via `menu_categories` + `menu_items` for grouped display
- "All items" = no rows in junction table (null means everything, explicit rows mean targeted)

