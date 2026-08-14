
CREATE OR REPLACE FUNCTION public.enroll_diner_in_loyalty(_diner_id uuid, _program_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _bonus numeric := 0;
  _rules jsonb;
  _new_id uuid;
BEGIN
  -- Only the diner themselves may enroll
  IF NOT EXISTS (SELECT 1 FROM public.diner_profiles WHERE id = _diner_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to enroll this diner';
  END IF;

  SELECT id INTO _existing FROM public.loyalty_balances
  WHERE diner_id = _diner_id AND program_id = _program_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT rules INTO _rules FROM public.loyalty_programs WHERE id = _program_id AND is_active = true;
  IF _rules IS NULL THEN
    RAISE EXCEPTION 'Program not found or inactive';
  END IF;

  _bonus := COALESCE((_rules->>'signup_bonus')::numeric, 0);

  INSERT INTO public.loyalty_balances (diner_id, program_id, balance, tier)
  VALUES (_diner_id, _program_id, _bonus, 'standard')
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_diner_in_loyalty(uuid, uuid) TO authenticated;
