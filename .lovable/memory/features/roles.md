---
name: Roles & permissions
description: Custom per-venue roles drive sidebar visibility and order-management permissions
type: feature
---
Each venue has its own `venue_roles` (with auto-seeded system roles Owner/Manager/Staff that cannot be deleted). `venue_role_permissions` stores per-role: `nav_keys[]` (top-level sidebar keys), `can_update_order_status`, `can_reopen_and_refund_orders`, `can_manage_roles`, `can_manage_settings`. `venue_staff.role_id` links a user to a role; legacy `venue_staff.role` enum is kept for now and used as fallback. Sub-nav items inherit their parent's `navKey` (e.g. Modifiers inherits `menu`, Order Display System inherits `orders`). Use `usePermissions()` hook from `src/hooks/use-permissions.ts`. Owners and `tabless_admin` always have full access.
