
DROP POLICY IF EXISTS "Anyone can create orders for live venues" ON public.orders;

CREATE POLICY "Anyone can create orders for live venues"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  venue_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = orders.venue_id
      AND COALESCE(v.is_active, true) = true
  )
  AND (
    -- Anonymous: must not claim a customer
    (auth.uid() IS NULL AND customer_id IS NULL)
    -- Authenticated: null, own user id, or own diner profile id
    OR (auth.uid() IS NOT NULL AND (
      customer_id IS NULL
      OR customer_id = auth.uid()
      OR customer_id = public.get_user_diner_profile_id()
    ))
    -- Venue staff/admins can attribute to any diner at their venue
    OR public.is_venue_staff(auth.uid(), venue_id)
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
  )
);
