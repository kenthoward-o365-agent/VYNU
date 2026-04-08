
DROP POLICY "Staff can manage balances" ON public.loyalty_balances;

CREATE POLICY "Staff can manage balances"
ON public.loyalty_balances
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM loyalty_programs lp
    WHERE lp.id = loyalty_balances.program_id
    AND (
      (lp.venue_id IS NOT NULL AND is_venue_staff(auth.uid(), lp.venue_id))
      OR (lp.group_id IS NOT NULL AND is_group_member(auth.uid(), lp.group_id))
      OR (lp.group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM venues v
        WHERE v.group_id = lp.group_id
        AND is_venue_staff(auth.uid(), v.id)
      ))
    )
  )
);
