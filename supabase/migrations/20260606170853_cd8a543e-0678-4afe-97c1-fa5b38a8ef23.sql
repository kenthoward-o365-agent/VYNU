
-- 1. venue_display_areas: hide throttle columns from anon via column-level grants
REVOKE SELECT ON public.venue_display_areas FROM anon;
GRANT SELECT (
  id, venue_id, name, description, color, display_order,
  is_active, is_default, base_prep_time_minutes,
  throttle_show_wait_to_diner, created_at, updated_at
) ON public.venue_display_areas TO anon;

-- 2. order_items: tighten INSERT policy with ownership / freshness checks
DROP POLICY IF EXISTS "Insert items into recent open orders" ON public.order_items;

CREATE POLICY "Insert items into own or freshly-created orders"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.status = ANY (ARRAY['received'::order_status, 'preparing'::order_status])
      AND (
        -- Venue staff can always add items
        public.is_venue_staff(auth.uid(), o.venue_id)
        -- Authenticated diner who owns the order
        OR (
          auth.uid() IS NOT NULL
          AND (
            o.customer_id = auth.uid()
            OR o.customer_id = public.get_user_diner_profile_id()
          )
        )
        -- Anonymous diner: only within the initial 5-minute placement window
        -- and only while the order is still in 'received' status
        OR (
          o.status = 'received'::order_status
          AND o.created_at > now() - interval '5 minutes'
        )
      )
  )
);
