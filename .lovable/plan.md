

# Diner Preferences — Personalisation Settings

## Overview
Add a "Diner Preferences" sub-menu under the Diners nav item in the sidebar. This opens a new page where venue managers configure how returning diners are treated. All settings are stored in the venue's existing `settings` jsonb column under a `diner_personalisation` key — no new database tables needed.

## What gets built

### 1. Sidebar sub-menu under Diners
Add a collapsible section under the "Diners" nav item (same pattern as Menu Builder and Settings sub-menus) with a single link: **Diner Preferences** → `/diners/preferences`.

### 2. New page: `DinerPreferences.tsx`
A settings page with the following sections, each with an on/off toggle (Switch) and expandable config when enabled:

**A. Personalised Welcome Message**
- Toggle on/off
- When on: textarea for custom welcome template with merge fields like `{name}`, `{tier}`, `{visits}`
- Preview of the rendered message
- Loyalty-level variants: ability to set different messages per tier (e.g. Bronze, Silver, Gold)

**B. Predictive Dining**
- Toggle on/off
- Description: AI predicts what the diner wants based on time of day, weather, party size, and past behaviour
- Sub-toggles for: Time-based suggestions, Weather-aware suggestions, Party-size detection
- Example preview: *"Welcome back, Kent — want your usual Friday night order?"*

**C. Order Again**
- Toggle on/off
- Description: Show a "Order Again" button offering the diner's last 10 orders in date order
- Config: number of past orders to show (default 10)

**D. Gamification**
- Toggle on/off
- Sub-toggles for:
  - **Status badges** — "Top 10% guest" recognition
  - **Secret menu items** — unlock hidden items at certain tiers/visit counts
  - **Early access dishes** — preview new items before general release
  - **Exploration tracker** — "You've tried 8/12 chef specials"
- Config: minimum visits or tier level to unlock each feature

### 3. Route + navigation
- Add `/diners/preferences` route in `App.tsx`
- Wire it into `DashboardLayout.tsx` sidebar under Diners with collapsible sub-nav

### 4. Data storage
All config saved to `venues.settings.diner_personalisation` as JSON — no migration needed. Structure:
```text
{
  welcome_message: { enabled, templates: { default, tiers: {...} } },
  predictive_dining: { enabled, time_based, weather_aware, party_size },
  order_again: { enabled, max_orders: 10 },
  gamification: { enabled, status_badges, secret_menu, early_access, exploration_tracker, unlock_threshold: 5 }
}
```

## Files to create/edit
- **Create** `src/pages/DinerPreferences.tsx` — the full settings page
- **Edit** `src/components/DashboardLayout.tsx` — add collapsible sub-nav under Diners (matching existing patterns for Menu Builder / Settings)
- **Edit** `src/App.tsx` — add route for `/diners/preferences`

## Technical notes
- Uses existing `venues.settings` jsonb column — no database migration
- Follows the same Collapsible sub-nav pattern already used for Menu Builder and Settings
- All toggles use the existing Switch component
- Saves via `supabase.from("venues").update({ settings: {...} })` merging with existing settings
- Australian spelling throughout: "Personalisation", "personalised", "behaviour"

