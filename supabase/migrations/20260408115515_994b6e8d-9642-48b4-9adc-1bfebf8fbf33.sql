DROP POLICY IF EXISTS "Managers can update loyalty programs" ON public.loyalty_programs;

CREATE POLICY "Managers can update loyalty programs"
ON public.loyalty_programs
FOR UPDATE
TO authenticated
USING (
  ((venue_id IS NOT NULL) AND is_venue_manager(auth.uid(), venue_id))
  OR
  ((group_id IS NOT NULL) AND is_group_admin(auth.uid(), group_id))
  OR
  ((group_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.group_id = loyalty_programs.group_id
      AND v.venue_type = 'parent'
      AND is_venue_manager(auth.uid(), v.id)
  ))
)
WITH CHECK (
  ((venue_id IS NOT NULL) AND is_venue_manager(auth.uid(), venue_id))
  OR
  ((group_id IS NOT NULL) AND is_group_admin(auth.uid(), group_id))
  OR
  ((group_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.group_id = loyalty_programs.group_id
      AND v.venue_type = 'parent'
      AND is_venue_manager(auth.uid(), v.id)
  ))
);