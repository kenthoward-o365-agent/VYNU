

## Goal

Move the three order-action permissions from the **Role** level to the **User** level. Roles still gate sidebar access (e.g. "this role can see Orders"); per-user toggles then refine *what they can do inside Orders*.

## Model change

Today: `venue_role_permissions.can_update_order_status / can_reopen_and_refund_orders` apply to everyone with that role.

New: add three columns to `venue_staff` (per user-per-venue):
- `can_update_order_status bool default false`
- `can_reopen_closed_orders bool default false` (NEW — re-open without refund)
- `can_process_refunds bool default false` (renamed concept of `can_reopen_and_refund_orders`)

Defaults backfill from current role:
- Owner/Manager staff rows → all three `true`
- Staff role rows → `can_update_order_status = true`, others `false`

The role-level `can_update_order_status` / `can_reopen_and_refund_orders` columns stay in the DB (harmless) but are no longer read by the app. Only nav_keys + `can_manage_roles` + `can_manage_settings` remain role-driven.

## UI changes

### `src/components/venue/RolesManager.tsx`
Remove the three order-action toggles from the role editor (if previously surfaced). Keep nav-keys, manage-roles, manage-settings.

### Users list (Settings → Users — find the existing component, likely `RolesManager.tsx` or a sibling)
For each user row, show three switches **only when their assigned role's nav_keys include `orders`**:
- Update order status
- Re-open closed orders
- Process refunds

Edits write to `venue_staff` for that user/venue. Owners always show all three on (read-only).

### `src/hooks/use-permissions.ts`
Replace role-permission lookup for these three flags with a `venue_staff` lookup for the current user/venue. Add `canReopenClosedOrders`. Owners + `tabless_admin` keep full-access shortcut.

### `src/pages/Orders.tsx`
- Status buttons gated by `canUpdateOrderStatus`
- On terminal-status cards:
  - **Re-open** button if `canReopenClosedOrders` → opens `ReopenStatusDialog` (pick a non-terminal status, no refund)
  - **Re-open & Refund** button if `canProcessRefunds` (existing flow)

### New `src/components/orders/ReopenStatusDialog.tsx`
Select of non-terminal `venue_order_statuses` → updates `orders.status`. Existing log trigger captures the change.

## Files touched

- `supabase/migrations/<ts>_user_order_permissions.sql` — add 3 columns to `venue_staff`, backfill from role
- `src/hooks/use-permissions.ts` — read from `venue_staff`, add `canReopenClosedOrders`
- `src/components/venue/RolesManager.tsx` — remove order toggles, add per-user toggles in users list (or split into a `UserPermissionsRow` component)
- `src/pages/Orders.tsx` — split re-open vs re-open-and-refund buttons
- `src/components/orders/ReopenStatusDialog.tsx` — new
- `src/pages/KnowledgeBase.tsx` — update Users & Roles section: roles = sidebar access, per-user toggles = order actions
- `src/integrations/supabase/types.ts` — auto-regenerated

## Out of scope

- Per-status restrictions ("can set Ready but not Cancelled")
- Time limits on re-open
- Bulk-edit user permissions

## Expected result

- Manager opens **Settings → Users** → sees Jane (role: Staff, has Orders access) → toggles "Update order status" on, leaves refunds off.
- Jane signs in → sees status buttons on order cards, no re-open or refund buttons.
- Manager toggles "Re-open closed orders" on for shift supervisor Tom → Tom now sees a "Re-open" button on Paid cards but still no refund button.
- Owner always sees all buttons regardless of toggles.

