
-- 1) SECURITY: Remove the 5-minute "freshly created order" fallback from
--    the order_items INSERT policy. That clause let any anon/auth user add
--    items to any order in 'received' status within 5 minutes of creation,
--    which is exploitable (guess a recent UUID -> inject items).
--    Legitimate consumer order creation goes through the SECURITY DEFINER
--    RPCs and either (a) staff role, (b) customer_id == auth.uid(), or
--    (c) customer_id == get_user_diner_profile_id().

DROP POLICY IF EXISTS "Insert items into own or freshly-created orders" ON public.order_items;

CREATE POLICY "order_items_insert_owner_or_staff"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.status IN ('received'::order_status, 'preparing'::order_status)
      AND (
        public.is_venue_staff(auth.uid(), o.venue_id)
        OR (auth.uid() IS NOT NULL AND (
              o.customer_id = auth.uid()
              OR o.customer_id = public.get_user_diner_profile_id()
            ))
      )
  )
);

-- 2) PERF: Top query by call volume (154k+ calls) is a scan of
--    venue_display_areas filtered by throttle_enabled = true. Add a tiny
--    partial index so it's an index-only lookup instead of a seq scan.

CREATE INDEX IF NOT EXISTS idx_venue_display_areas_throttle_enabled
ON public.venue_display_areas (venue_id)
WHERE throttle_enabled = true;
