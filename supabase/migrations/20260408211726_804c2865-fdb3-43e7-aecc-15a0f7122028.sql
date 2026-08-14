CREATE OR REPLACE FUNCTION public.can_manage_loyalty_program_balance(_user_id uuid, _program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.loyalty_programs lp
    WHERE lp.id = _program_id
      AND (
        (lp.venue_id IS NOT NULL AND public.is_venue_staff(_user_id, lp.venue_id))
        OR (lp.group_id IS NOT NULL AND public.is_group_member(_user_id, lp.group_id))
        OR (
          lp.group_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.venues v
            WHERE v.group_id = lp.group_id
              AND public.is_venue_staff(_user_id, v.id)
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Staff can manage balances" ON public.loyalty_balances;
DROP POLICY IF EXISTS "Staff can view balances for their programs" ON public.loyalty_balances;
DROP POLICY IF EXISTS "Staff can update balances" ON public.loyalty_balances;

CREATE POLICY "Staff can manage balances"
ON public.loyalty_balances
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_loyalty_program_balance(auth.uid(), program_id));

CREATE POLICY "Staff can view balances for their programs"
ON public.loyalty_balances
FOR SELECT
TO authenticated
USING (public.can_manage_loyalty_program_balance(auth.uid(), program_id));

CREATE POLICY "Staff can update balances"
ON public.loyalty_balances
FOR UPDATE
TO authenticated
USING (public.can_manage_loyalty_program_balance(auth.uid(), program_id))
WITH CHECK (public.can_manage_loyalty_program_balance(auth.uid(), program_id));