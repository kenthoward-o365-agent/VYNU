-- IAM-06: Re-scope the guest order_items INSERT policy.
--
-- The previous policy (order_items_insert_guest_for_live_venue) let anyone
-- insert an item into ANY anonymous order in 'received'/'preparing' status at
-- a live venue, gated only by knowing the order UUID — so a leaked order id
-- allowed appending items to a stranger's bill. We bind guest inserts to an
-- active table session and, for solo (session-less) guest orders, to a short
-- freshness window so the exposure is not open-ended.

-- Helper: is a table session currently active? Used inside the guest INSERT
-- policy below. It MUST be SECURITY DEFINER because anon (and non-staff
-- authenticated diners) have no SELECT policy on public.table_sessions
-- (revoked in 20260612182334); a bare `EXISTS (SELECT ... FROM table_sessions)`
-- inside the policy would therefore evaluate to false for exactly the guests
-- this policy is meant to allow, silently breaking group-order add-item. The
-- function only returns a boolean (open/firing?), so it leaks no session data.
CREATE OR REPLACE FUNCTION public.is_active_table_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.table_sessions ts
    WHERE ts.id = _session_id
      AND ts.status IN ('open', 'firing')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_active_table_session(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "order_items_insert_guest_for_live_venue" ON public.order_items;

CREATE POLICY "order_items_insert_guest_for_live_venue"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.venues v ON v.id = o.venue_id
    WHERE o.id = order_items.order_id
      AND o.customer_id IS NULL
      AND o.status IN ('received'::order_status, 'preparing'::order_status)
      AND COALESCE(v.is_active, true) = true
      AND (
        -- (a) order belongs to an active table session (checked via a
        --     SECURITY DEFINER helper so it works for anon guests), OR
        public.is_active_table_session(o.session_id)
        -- (b) session-less (solo) guest order created very recently
        OR (o.session_id IS NULL AND o.created_at > now() - interval '30 minutes')
      )
  )
);
