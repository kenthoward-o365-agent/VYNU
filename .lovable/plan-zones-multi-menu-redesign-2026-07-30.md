# Zones & Multi-Menu Redesign

Turn "zone" from a free-text label on tables into a real venue structure: each zone is an outlet (Bar, Bistro, Rooftop) with its own menu, its own payment rules, and a dropdown everywhere zones are chosen.

## What you get

**1. New "Zones" tab in Venue Settings**
- Added as the last tile in the settings hub (bottom right).
- Create, rename, reorder, activate/deactivate zones.
- Each zone card has three sections:
  - **Details** — name, description, colour.
  - **Menu** — pick the one menu this zone serves.
  - **Payments** — pay on order vs run a tab, optional card pre-auth + amount, tab limit, allow split payments. This replaces the standalone "Open Tabs" tile, which is removed; existing tab-zone settings carry across automatically.

**2. Zones as a dropdown when creating tables / QR codes**
- The free-text Zone field on the Tables page becomes a select fed by the venue's zones (with "No zone" allowed).
- Existing tables with text zones ("Bar", "Bistro") are matched to the new zone records by name, so nothing is lost and QR codes are untouched.

**3. Multiple menus per venue, one menu per zone**
- New concept: a **Menu** (e.g. Bistro Menu, Bar Snacks, Rooftop). A menu owns categories and items; a menu can be shared by several zones, but each zone serves exactly one menu.
- Everything you have today moves into a menu called **Main Menu**, assigned to every zone — diners see no change.
- Each menu has its own schedule: active days plus start/end time (e.g. Lunch 11:00-15:00). Item-level time frames keep working on top of that.

**4. Menu Builder grouped by zone**
- A zone/menu switcher at the top of Menu Builder. Choosing a zone shows the menu that zone serves; you can also browse by menu directly.
- All existing features (categories, items, images, modifiers, display areas, pricing, AI tools, reorder) work unchanged inside the selected menu.
- Add / rename / duplicate / delete menus from the same switcher, plus edit that menu's schedule.

**5. Diner app picks the right menu**
- When a diner scans a table QR, the app loads the menu for that table's zone, honouring the menu schedule.
- Zone payment rules already drive pay-now vs tab; they now read from the zone record instead of the old tab-zone table.

## Technical notes

Database (single migration, with GRANTs + RLS on every new table):
- `venue_zones` — venue_id, name, description, colour, display_order, is_active, plus the payment fields migrated from `venue_tab_zones` (tabs_enabled, require_preauth, preauth_amount, max_tab_amount, allow_split_payments), and `menu_id`.
- `venue_menus` — venue_id, name, description, is_active, display_order, schedule fields (active_days, start_time, end_time).
- `menu_categories.menu_id` added (nullable, then backfilled to the created "Main Menu" per venue, then indexed).
- `tables.zone_id` added alongside the existing `zone` text; backfill by matching zone text, keep `zone` in sync for compatibility.
- Data backfill: one `venue_zones` row per distinct `tables.zone` per venue, merged with any `venue_tab_zones` rows; one "Main Menu" per venue linked to all its zones.
- RPCs updated: `get_table_tab_rules` and `find_or_open_tab` read `venue_zones`; `get_menu_snapshot` accepts an optional zone/menu and filters categories by `menu_id` and menu schedule.
- `venue_tab_zones` is left in place but no longer read, so nothing breaks mid-deploy.

Frontend:
- New `src/components/venue/ZonesSettingsTab.tsx`; `TabsSettingsTab.tsx` removed from the hub and its logic folded into the zone card.
- `src/pages/VenueSettings.tsx` — hub tile + route for `?tab=zones`, remove `tabs` tile.
- `src/pages/Tables.tsx` — zone select bound to `zone_id`.
- `src/pages/MenuBuilder.tsx` — zone/menu switcher, all queries scoped by `menu_id`; new `MenuManagerDialog` for create/rename/schedule.
- `src/hooks/use-menu-snapshot.ts` and the consumer order flow pass the table's zone so the correct menu loads.
