

# Expose POS Identifiers as Editable Fields

## Overview

Add editable POS ID and PLU fields to menu items, modifiers, and modifier categories in the Menu Builder and Modifiers pages. These fields allow venue managers to manually map their items to external POS records -- useful during initial setup, troubleshooting, or when full automated sync isn't available.

## Database Changes

Add missing POS columns to modifiers and related tables:

```sql
ALTER TABLE public.modifiers ADD COLUMN pos_id text;
ALTER TABLE public.modifiers ADD COLUMN plu text;
ALTER TABLE public.modifier_categories ADD COLUMN pos_id text;
ALTER TABLE public.orders ADD COLUMN pos_order_id text;
ALTER TABLE public.tables ADD COLUMN pos_table_id text;
```

## Frontend Changes

### 1. Menu Builder item edit dialog

Add a collapsible "POS Integration" section at the bottom of the item add/edit form with:
- **PLU** (text input) -- Product Lookup Unit code
- **POS ID** (text input) -- external system identifier

These fields are always visible (not just in POS mode) so managers can pre-populate mappings before switching to POS sync. The form state and save logic will include `plu` and `pos_id`.

### 2. Modifiers page

Add `pos_id` and `plu` fields to the modifier edit dialog, and `pos_id` to the modifier category edit flow. Same collapsible "POS Integration" section pattern.

### 3. Tables page

Add a `pos_table_id` text field to the table edit dialog so venues can map tables to POS terminal/table numbers.

### 4. Menu Builder item cards (POS mode)

When `isPosMode` is true, show the PLU as a small badge on each item card (already partially done -- this ensures the value is current after manual edits).

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add `pos_id`, `plu` to modifiers; `pos_id` to modifier_categories; `pos_order_id` to orders; `pos_table_id` to tables |
| `src/pages/MenuBuilder.tsx` | Add PLU + POS ID fields to item form, include in save/update |
| `src/pages/Modifiers.tsx` | Add POS ID + PLU fields to modifier edit, POS ID to category edit |
| `src/pages/Tables.tsx` | Add POS Table ID field to table edit dialog |

