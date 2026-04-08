DROP POLICY IF EXISTS "Managers can manage venue loyalty programs" ON public.loyalty_programs;
DROP POLICY IF EXISTS "Managers can update loyalty programs" ON public.loyalty_programs;
DROP POLICY IF EXISTS "Managers can delete loyalty programs" ON public.loyalty_programs;
DROP POLICY IF EXISTS "Staff can view venue loyalty programs" ON public.loyalty_programs;

CREATE POLICY "Managers can manage loyalty programs"
ON public.loyalty_programs
FOR INSERT
TO authenticated
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

CREATE POLICY "Managers can delete loyalty programs"
ON public.loyalty_programs
FOR DELETE
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
);

CREATE POLICY "Staff can view loyalty programs"
ON public.loyalty_programs
FOR SELECT
TO authenticated
USING (
  ((venue_id IS NOT NULL) AND is_venue_staff(auth.uid(), venue_id))
  OR
  ((group_id IS NOT NULL) AND is_group_member(auth.uid(), group_id))
  OR
  ((group_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.group_id = loyalty_programs.group_id
      AND v.venue_type = 'parent'
      AND is_venue_staff(auth.uid(), v.id)
  ))
);
