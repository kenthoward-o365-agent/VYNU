DROP POLICY IF EXISTS "Authenticated users can create venues" ON public.venues;
CREATE POLICY "Authenticated users can create venues"
ON public.venues
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    group_id IS NULL
    OR public.is_group_admin(auth.uid(), group_id)
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
  )
);