DROP POLICY IF EXISTS "Staff can view loyalty programs" ON public.loyalty_programs;

CREATE POLICY "Staff can view loyalty programs"
ON public.loyalty_programs
FOR SELECT
TO authenticated
USING (
  ((venue_id IS NOT NULL) AND is_venue_staff(auth.uid(), venue_id))
  OR (
    (group_id IS NOT NULL)
    AND is_group_member(auth.uid(), group_id)
  )
  OR (
    (group_id IS NOT NULL)
    AND EXISTS (
      SELECT 1
      FROM public.venues child_venue
      WHERE child_venue.group_id = loyalty_programs.group_id
        AND child_venue.venue_type <> 'parent'
        AND is_venue_staff(auth.uid(), child_venue.id)
    )
  )
  OR (
    (group_id IS NOT NULL)
    AND EXISTS (
      SELECT 1
      FROM public.venues parent_venue
      WHERE parent_venue.group_id = loyalty_programs.group_id
        AND parent_venue.venue_type = 'parent'
        AND is_venue_staff(auth.uid(), parent_venue.id)
    )
  )
);