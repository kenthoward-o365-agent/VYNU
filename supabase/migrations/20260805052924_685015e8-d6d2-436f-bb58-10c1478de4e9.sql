CREATE OR REPLACE FUNCTION public.is_active_venue(_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.venues v
     WHERE v.id = _venue_id
       AND COALESCE(v.is_active, true) = true
  )
$$;

COMMENT ON FUNCTION public.is_active_venue(uuid) IS
  'True when the venue exists and is active. SECURITY DEFINER so RLS policies can prove a venue is live without granting the caller read access to public.venues. Returns a boolean only — no venue data is exposed.';

REVOKE ALL ON FUNCTION public.is_active_venue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_venue(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can create orders for live venues" ON public.orders;

CREATE POLICY "Anyone can create orders for live venues"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (
  venue_id IS NOT NULL
  AND public.is_active_venue(venue_id)
  AND (
    (auth.uid() IS NULL AND customer_id IS NULL)
    OR (auth.uid() IS NOT NULL AND (
          customer_id IS NULL
          OR customer_id = auth.uid()
          OR customer_id = public.get_user_diner_profile_id()
       ))
    OR public.is_venue_staff(auth.uid(), venue_id)
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
  )
);