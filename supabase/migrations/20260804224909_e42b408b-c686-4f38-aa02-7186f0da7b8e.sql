DROP POLICY IF EXISTS "Anyone can create orders for live venues" ON public.orders;
CREATE POLICY "Anyone can create orders for live venues"
ON public.orders FOR INSERT TO anon, authenticated
WITH CHECK (
  venue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.venues v WHERE v.id = orders.venue_id AND COALESCE(v.is_active, true) = true)
  AND (
    (auth.uid() IS NULL AND (
       customer_id IS NULL
       OR EXISTS (SELECT 1 FROM public.diner_profiles d WHERE d.id = orders.customer_id AND d.user_id IS NULL)
    ))
    OR (auth.uid() IS NOT NULL AND (
       customer_id IS NULL
       OR customer_id = auth.uid()
       OR customer_id = public.get_user_diner_profile_id()
    ))
    OR public.is_venue_staff(auth.uid(), venue_id)
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
  )
);