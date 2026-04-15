

# POS Integration Mode for Menu Builder

## Overview

Add a venue-level `menu_source` setting that controls whether the menu is managed manually via the AI-driven builder or synced from an external POS system. When POS mode is active, the Menu Builder shows a read-only view with a banner indicating POS ownership, and manual editing is disabled.

## Database Changes

### Add `menu_source` column to `venues`

```sql
ALTER TABLE public.venues
  ADD COLUMN menu_source text NOT NULL DEFAULT 'manual';
-- values: 'manual' | 'pos'
```

### New table: `venue_pos_integrations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `venue_id` | uuid | unique, references venues |
| `pos_provider` | text | e.g. 'lightspeed', 'square', 'kounta', 'doshii' |
| `api_key_ref` | text | secret name reference (not the key itself) |
| `endpoint_url` | text | nullable, provider webhook/API base |
| `last_sync_at` | timestamptz | nullable |
| `sync_status` | text | 'idle', 'syncing', 'error' |
| `config` | jsonb | provider-specific settings |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

RLS: managers can CRUD, staff can SELECT.

### Add `pos_id` to `menu_items` and `menu_categories`

```sql
ALTER TABLE public.menu_items ADD COLUMN pos_id text;
ALTER TABLE public.menu_categories ADD COLUMN pos_id text;
```

These store the external POS identifier for each item/category so syncs can match records.

## Frontend Changes

### 1. Menu Builder — `src/pages/MenuBuilder.tsx`

- Read `venue.menu_source` from the venue context
- If `menu_source === 'pos'`:
  - Show a banner: "Menu managed by POS — [Provider Name]. Last synced: [timestamp]"
  - Hide add/edit/delete/import/AI-generate buttons
  - Items render in read-only mode (no drag-and-drop, no edit dialogs)
  - Show a "Sync Now" button that triggers a manual re-sync
- If `menu_source === 'manual'` (default): current behavior unchanged

### 2. Venue Settings — `src/pages/VenueSettings.tsx`

Add a new **"Integrations"** tab with:
- A toggle/switch: "Menu Source" — Manual vs POS
- When POS is selected, show provider dropdown (Lightspeed, Square, Kounta, Doshii, Other)
- Fields for connection config (API key reference, endpoint)
- Connection status indicator
- "Test Connection" button (placeholder for now)
- Warning dialog when switching from Manual to POS: "Existing manual menu items will be preserved but POS sync will overwrite them"

### 3. VenueContext update

Expose `menu_source` from the venue object so components can check it without extra queries.

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add `menu_source` to venues, create `venue_pos_integrations`, add `pos_id` to menu_items/categories |
| `src/pages/MenuBuilder.tsx` | Read-only mode when `menu_source === 'pos'`, POS banner, sync button |
| `src/pages/VenueSettings.tsx` | New "Integrations" tab with POS config |
| `src/contexts/VenueContext.tsx` | Expose `menu_source` (already available via venue row) |

## What This Does NOT Include (Next Phase)

- Actual POS API edge functions (sync logic per provider)
- Webhook receivers for real-time POS pushes
- Conflict resolution between manual overrides and POS syncs

These will be built in the next step once the integration framework is in place.

