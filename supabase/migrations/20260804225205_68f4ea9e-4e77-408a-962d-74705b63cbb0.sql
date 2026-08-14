CREATE OR REPLACE FUNCTION public.is_guest_diner_profile(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.diner_profiles d WHERE d.id = _profile_id AND d.user_id IS NULL)
$$;
REVOKE ALL ON FUNCTION public.is_guest_diner_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_guest_diner_profile(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can create orders for live venues" ON public.orders;
CREATE POLICY "Anyone can create orders for live venues"
ON public.orders FOR INSERT TO anon, authenticated
WITH CHECK (
  venue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.venues v WHERE v.id = orders.venue_id AND COALESCE(v.is_active, true) = true)
  AND (
    (auth.uid() IS NULL AND (customer_id IS NULL OR public.is_guest_diner_profile(customer_id)))
    OR (auth.uid() IS NOT NULL AND (customer_id IS NULL OR customer_id = auth.uid() OR customer_id = public.get_user_diner_profile_id()))
    OR public.is_venue_staff(auth.uid(), venue_id)
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
  )
);