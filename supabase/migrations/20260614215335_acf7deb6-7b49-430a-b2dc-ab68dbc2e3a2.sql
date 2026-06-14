
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
  )
);
