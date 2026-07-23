-- IAM-04: Server-authoritative loyalty enrollment.
--
-- Previously diners inserted their own loyalty_balances rows with a
-- client-supplied `balance` (the "Diners can enrol themselves" INSERT policy
-- checked only ownership, not the amount), so a diner could self-grant
-- arbitrary points. We:
--   1) add a SECURITY DEFINER RPC that computes the signup bonus from the
--      program's own rules and inserts the balance server-side, and
--   2) tighten the diner INSERT policy so any direct self-insert must have
--      balance = 0.

-- 1) Enrollment RPC — bonus is derived from the program, never the client.
CREATE OR REPLACE FUNCTION public.enroll_diner_in_loyalty(
  _diner_id uuid,
  _program_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bonus numeric := 0;
BEGIN
  -- The caller may only enroll their OWN diner profile.
  IF _diner_id IS DISTINCT FROM public.get_user_diner_profile_id() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Program must exist and be active; read the signup bonus from its rules.
  SELECT COALESCE((lp.rules->>'signup_bonus')::numeric, 0)
    INTO _bonus
  FROM public.loyalty_programs lp
  WHERE lp.id = _program_id AND lp.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty program not found or inactive';
  END IF;

  INSERT INTO public.loyalty_balances (diner_id, program_id, balance)
  VALUES (_diner_id, _program_id, _bonus)
  ON CONFLICT (diner_id, program_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_diner_in_loyalty(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_diner_in_loyalty(uuid, uuid) TO authenticated;

-- 2) Tighten the diner self-enrollment INSERT policy: a diner may still
--    insert their own row, but only with a zero balance. Real crediting
--    happens through the RPC above (or staff/loyalty-earn paths).
DROP POLICY IF EXISTS "Diners can enrol themselves" ON public.loyalty_balances;
CREATE POLICY "Diners can enrol themselves"
ON public.loyalty_balances
FOR INSERT
TO authenticated
WITH CHECK (
  diner_id = public.get_user_diner_profile_id()
  AND balance = 0
);
