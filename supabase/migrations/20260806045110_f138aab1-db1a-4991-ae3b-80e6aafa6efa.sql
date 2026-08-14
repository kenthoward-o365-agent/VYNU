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
       AND o.customer_id IS NULL
       AND o.status IN ('received'::order_status, 'preparing'::order_status)
       AND COALESCE(v.is_active, true) = true
       AND (
         EXISTS (
           SELECT 1 FROM public.table_sessions ts
            WHERE ts.id = o.session_id
              AND ts.status IN ('open', 'firing')
         )
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