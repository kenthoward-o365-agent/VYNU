# Apply the two pending migrations from the latest GitHub push

## What the last push contains

PR #12 (`fix/guest-order-items-policy`) plus commit `215b0c77` added two migration files and no edge-function changes:

- `20260805140000_guest_order_items_policy.sql`
- `20260805160000_restore_guest_audit_date_execute.sql`

`git diff 6698842f..HEAD` shows only those two SQL files and a plan document — no function or shared code changed, so nothing needs redeploying.

## Both migrations are genuinely unapplied

Verified against the live database:

- `can_append_guest_order_item` does not exist, and `order_items` still carries the old inline-subquery version of `order_items_insert_guest_for_live_venue`. Guests can read neither `orders` nor `venues`, so that EXISTS is false for exactly the guests it should allow — the 42501 on guest QR order items.
- `get_venue_audit_date` ACL is `authenticated`/`service_role` only; `anon` was swept out by the 20260730 hardening block. Guest checkout calls it on every order, so it 401s and the client falls back to the browser's local date, mis-stamping `orders.audit_date` for venues trading past midnight.

## Plan

1. Apply `20260805140000_guest_order_items_policy.sql` — creates the `can_append_guest_order_item` SECURITY DEFINER helper and rewrites the guest `order_items` INSERT policy to use it.
2. Apply `20260805160000_restore_guest_audit_date_execute.sql` — grants `anon` EXECUTE on `get_venue_audit_date` and comments it so future permission sweeps skip it.
3. Verify:
   - `can_append_guest_order_item` exists and the policy references it; `get_venue_audit_date` ACL includes `anon`.
   - Place a guest order with items at Young & Jackson table 100 as an anonymous caller and confirm both the order and its items insert (no 42501), with `audit_date` coming from the RPC.

## Technical notes

- No source files change; this is an apply-only pass over already-merged SQL.
- No edge functions were touched in these commits, so no redeploy is required.
- The four older out-of-band migrations still missing from the ledger stay untouched — their objects are already present in the database.
