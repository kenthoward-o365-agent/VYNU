

# Sippa Platform Pricing Model — Venue Billing Configuration

## Overview
Build a pricing configuration system that lets Sippa admins set per-venue (or per-group) billing terms: a percentage commission on ticket sales (excl. tax) and a minimum monthly SaaS fee. This lays the groundwork for a future billing/invoicing tool.

## What gets built

### 1. Database: `venue_billing_config` table
Stores the billing terms for each venue. Group-level defaults can be set on the parent venue and inherited by children.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `venue_id` | uuid FK → venues, UNIQUE | One config per venue |
| `commission_percent` | numeric, default 0 | % of ticket sale excl. tax |
| `min_monthly_fee` | numeric, default 0 | Minimum SaaS fee per month (AUD) |
| `billing_currency` | text, default 'AUD' | |
| `inherit_from_group` | boolean, default true | If true, use parent venue's config |
| `notes` | text, nullable | Internal admin notes |
| `created_at`, `updated_at` | timestamptz | |

RLS: only `tabless_admin` role can SELECT/INSERT/UPDATE/DELETE.

### 2. Admin UI: "Billing" tab on AdminVenueDetail page
Add a new tab alongside the existing Details/Staff/Loyalty tabs:
- **Commission rate (%)** — numeric input with two decimals
- **Minimum monthly fee ($)** — currency input
- **Inherit from group** — toggle (only shown if venue belongs to a group). When on, the fields show the parent's values as read-only with a note "Inherited from [Group Name]"
- **Notes** — textarea for internal admin notes
- Save button persists to `venue_billing_config` (upsert)

### 3. Group-level billing defaults
When viewing a **parent venue** in AdminVenueDetail, the Billing tab shows:
- The commission % and min fee fields as "Group default" values
- A list of child venues showing which ones inherit vs override, with their effective rates
- Admins can set overrides per child venue from the parent view or from the child's own detail page

### 4. Display billing info on AdminVenues list
Add a "Commission" column to the venues table showing the effective commission % for quick scanning.

## Files
- **Migration** — create `venue_billing_config` table with RLS (tabless_admin only)
- **Edit** `src/pages/AdminVenueDetail.tsx` — add Billing tab with commission/fee inputs, inherit toggle, group defaults display
- **Edit** `src/pages/AdminVenues.tsx` — add commission column to venue list table

## Technical notes
- `inherit_from_group = true` means: at query time, if the venue has a group_id, look up the parent venue's (venue_type = 'parent') billing config for effective values. This logic lives in the UI for now; the billing tool will use it server-side later.
- Commission is on ticket total **excluding tax** — the tax exclusion calculation already exists in `src/lib/tax-utils.ts` and will be reused by the future billing engine.
- No charges are processed here — this is configuration only. The billing tool built later will read these configs to generate invoices.

