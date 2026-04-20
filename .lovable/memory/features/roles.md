---
name: Roles & per-user permissions
description: Roles gate sidebar access; per-user toggles on venue_staff gate Orders actions (status, re-open, refunds)
type: feature
---
Two-layer model. **Roles** (`venue_roles` + `venue_role_permissions`) control sidebar nav (`nav_keys`), `can_manage_roles`, `can_manage_settings`. The legacy `can_update_order_status` and `can_reopen_and_refund_orders` columns on `venue_role_permissions` still exist but are NO LONGER read by the app. **Per-user toggles** live on `venue_staff`: `can_update_order_status`, `can_reopen_closed_orders`, `can_process_refunds`. The `usePermissions()` hook reads nav + manage flags from the role and the three order flags from the staff row. Owners and `tabless_admin` get full access. Edit toggles in Settings → Users → Edit (only shown when role has `orders` nav). Orders.tsx renders three button groups based on these flags: status row (`canUpdateOrderStatus`), Re-open dialog (`canReopenClosedOrders`, no money), Re-open & Refund dialog (`canProcessRefunds`, calls Adyen).
