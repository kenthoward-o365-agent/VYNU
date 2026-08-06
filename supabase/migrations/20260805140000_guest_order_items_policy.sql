-- Guest QR orders fail with 42501 "new row violates row-level security policy
-- for table order_items".
--
-- Second instance of the same defect fixed for public.orders in
-- 20260805100000. The guest order_items INSERT policy from IAM-06 proves the
-- order is appendable with an inline subquery:
--
--   AND EXISTS (
--     SELECT 1 FROM public.orders o
--     JOIN public.venues v ON v.id = o.venue_id
--     WHERE ... )
--
-- A policy expression runs with the caller's privileges, and a guest can read
-- neither table:
--   * public.venues — SELECT revoked from anon (20260612163506 and earlier)
--   * public.orders — the only SELECT policy is TO authenticated
--
-- So the EXISTS is false for exactly the guests the policy exists to permit,
-- and every guest order_items insert is rejected.
--
-- IAM-06 anticipated this hazard. Its own comment explains that a bare EXISTS
-- over table_sessions "would therefore evaluate to false for exactly the guests
-- this policy is meant to allow", and it correctly routed that check through
-- is_active_table_session(). The orders/venues join two lines below was left
-- inline.
--
-- Fix: move the whole check behind a SECURITY DEFINER helper, exactly as IAM-06
-- did for table_sessions. Every condition it wrote is carried over unchanged —
-- guest-only orders, appendable status, live venue, active session or the
-- 30-minute solo window. No protection is relaxed; the guest can simply now
-- satisfy the checks intended for them. The helper returns a boolean, so no
-- order or venue data is exposed.

CREATE OR REPLACE FUNCTION public.can_append_guest_order_item(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.orders o
      JOIN public.venues v ON v.id = o.venue_id
     WHERE o.id = _order_id
       -- Guest orders only. Signed-in diners and staff are covered by
       -- order_items_insert_owner_or_staff, which does not touch venues.
       AND o.customer_id IS NULL
       AND o.status IN ('received'::order_status, 'preparing'::order_status)
       AND COALESCE(v.is_active, true) = true
       AND (
         -- (a) order belongs to an active table session, or
         public.is_active_table_session(o.session_id)
          OR (o.session_id IS NULL AND o.created_at > statement_timestamp() - interval '30 minutes')
       )
  )
$$;

COMMENT ON FUNCTION public.can_append_guest_order_item(uuid) IS
  'True when a guest may append an item to this order: guest-owned, still appendable, live venue, and either bound to an active table session or created within the last 30 minutes. SECURITY DEFINER because guests can read neither public.orders nor public.venues. Returns a boolean only — no order or venue data is exposed.';

REVOKE ALL ON FUNCTION public.can_append_guest_order_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_append_guest_order_item(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "order_items_insert_guest_for_live_venue" ON public.order_items;

CREATE POLICY "order_items_insert_guest_for_live_venue"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_id IS NOT NULL
  AND public.can_append_guest_order_item(order_id)
);
