

## Goal

Replace the hard-coded 3-tier `venue_staff_role` (owner/manager/staff) with **custom, venue-defined roles** that drive **per-route navigation visibility** and **two new permissions**: *update order status* and *re-open & refund closed orders* (via OrdrPay).

## Schema (one migration)

1. **`venue_roles`** — custom roles per venue
   - `id`, `venue_id`, `name` (e.g. "Bar Staff"), `description`, `is_system bool` (true for the seeded owner/manager/staff so they can't be deleted), `display_order`, timestamps
   - Unique `(venue_id, name)`; RLS: staff SELECT, manager write
   - Auto-seed trigger on venue insert: **Owner** (system, all perms), **Manager** (system, all perms except role mgmt), **Staff** (system, view-only)

2. **`venue_role_permissions`** — JSON-driven permission grid per role
   - `role_id` (PK), `nav_keys text[]` (e.g. `['dashboard','orders','menu','settings.users']`), `can_update_order_status bool`, `can_reopen_and_refund_orders bool`, `can_manage_roles bool`, `can_manage_settings bool`
   - One row per role; seed defaults: owner = all perms + all nav, manager = all nav + status/refund, staff = `['dashboard','orders','tables']` + `can_update_order_status=true` only

3. **`venue_staff.role_id uuid nullable`** → FK to `venue_roles(id) ON DELETE SET NULL`
   - Backfill: map existing `venue_staff.role` enum values to the seeded system roles for that venue
   - Keep the legacy enum column for now (drop in a follow-up after UI fully migrated)

4. **`order_refunds`** (new table) — audit trail for OrdrPay refunds
   - `id`, `order_id`, `venue_id`, `amount`, `currency`, `reason`, `pspReference` (returned by OrdrPay), `status` (`pending`|`received`|`failed`), `requested_by` (user_id), `created_at`
   - RLS: staff SELECT (own venue), manager INSERT

## Permission system (frontend)

New `usePermissions()` hook in `src/hooks/use-permissions.ts`:
- Loads the active venue's `venue_role_permissions` for the current user's `venue_staff.role_id`
- Returns `{ can(navKey), canUpdateOrderStatus, canReopenAndRefund, canManageRoles, canManageSettings, isLoading }`
- `tabless_admin` and `owner` always return true for everything

Each top-level nav item gets a stable `navKey`. Sub-items inherit the parent's key (per the requirement: "if the role has access to an Expand/Collapse item the sub sections follow same access setting"). Settings tabs use compound keys (`settings.users`, `settings.payments`, etc.) but inherit `settings` if the role has it.

## UI changes

### `src/components/DashboardLayout.tsx`
- Wrap each `venueNavItems` entry with `if (perms.can(item.navKey))` filter before render. Group + Admin nav unchanged.
- Sub-items render iff parent renders (no separate gating per sub).

### `src/pages/VenueSettings.tsx` — Users tab
Two-section layout:

**Section A — Roles** (new, above the staff table)
- List of venue roles with name, description, badge for "System", and member count
- "Add Role" button → modal with name, description, **nav access checklist** (one checkbox per top-level nav item, no sub-items shown), and three permission toggles (Update Order Status, Re-open & Refund Closed Orders, Manage Roles & Permissions)
- Edit / delete (delete blocked for system roles or roles with members)

**Section B — Users** (existing table)
- "Role" column changes from enum badge to a **role select** (lists `venue_roles` for this venue) — saves `venue_staff.role_id`
- "Add User" modal role dropdown sourced from `venue_roles` instead of hard-coded enum

### `src/pages/Orders.tsx` — order card
- Hide the status `<Select>` when `!canUpdateOrderStatus`
- For terminal orders (`paid`, `served`, `cancelled`), show a **"Re-open & Refund"** button when `canReopenAndRefund`
- Button opens a `RefundDialog` (new component) — amount field (defaults to order total, max = total minus prior refunds), reason textarea, confirm
- On confirm → calls `adyen-payment` edge function with `action: "refund"`; on success: inserts `order_refunds` row, sets order status back to `received` (or a new `refunded` terminal state — see below), shows toast
- Below the order total, render a small "Refunds" summary listing prior `order_refunds` rows with timestamp + amount

### Order status — add `refunded`
- Add `refunded` to `order_status` enum (migration) and to `statusConfig` map; mark as terminal
- "Re-open & Refund" sets status to `received` to allow staff to work it (refund row tracked separately); a fully-refunded order auto-flips to `refunded` once `sum(order_refunds.amount) >= order.total`

## Edge function — `supabase/functions/adyen-payment/index.ts`

Add a new `refund` action:
- Inputs: `venue_id`, `order_id`, `amount`, `reason`
- Looks up the original `pspReference` for the order (need a new `orders.payment_psp_reference text` column — add to migration; populate going forward when payment captures)
- Calls OrdrPay processor refund endpoint with the PSP reference + amount in minor units
- Returns `{ pspReference, status }` — caller writes the `order_refunds` row
- All user-visible error strings remain OrdrPay-branded (no processor name)

## Files touched

- `supabase/migrations/<ts>_roles_permissions_refunds.sql` — `venue_roles`, `venue_role_permissions`, `order_refunds`, `venue_staff.role_id`, `orders.payment_psp_reference`, `refunded` enum value, seed trigger + backfill
- `src/hooks/use-permissions.ts` — new
- `src/components/DashboardLayout.tsx` — gate nav items by `perms.can(navKey)`
- `src/pages/VenueSettings.tsx` — Roles section + role-select on staff
- `src/pages/Orders.tsx` — gate status select, add Re-open & Refund button + refund summary
- `src/components/orders/RefundDialog.tsx` — new
- `supabase/functions/adyen-payment/index.ts` — new `refund` action
- `src/integrations/supabase/types.ts` — auto-regenerated
- `.lovable/memory/features/payments.md` & `schema.md` — note refund flow + roles tables

## Out of scope

- Per-sub-item permissions (sub-items strictly inherit parent — per request)
- Group-level / cross-venue role templates
- Partial-refund UX beyond a single amount field (no per-line-item refunds yet)
- Removing the legacy `venue_staff.role` enum column (retired in a follow-up)

## Expected result

- Manager opens **Settings → Users** → creates "Bar Staff" role with only Dashboard + Orders nav and "Update Order Status" enabled → assigns it to a user.
- That user logs in: sidebar shows only Dashboard + Orders; can advance order status but never sees Menu, Pricing, Settings, etc.
- A manager opens a paid order → clicks **Re-open & Refund** → enters amount + reason → OrdrPay processes the refund → order is reopened, refund logged on the card, fully-refunded orders flip to `refunded`.

