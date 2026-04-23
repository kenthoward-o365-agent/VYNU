DROP FUNCTION IF EXISTS public.pair_display_terminal(text, text);

CREATE OR REPLACE FUNCTION public.pair_display_terminal(_code text, _user_agent text)
RETURNS TABLE(terminal_id uuid, device_token uuid, terminal_name text, area_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _terminal RECORD;
  _new_token uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.id, t.venue_id, t.name INTO _terminal
  FROM public.display_terminals t
  WHERE t.pairing_code = upper(trim(_code))
    AND t.pairing_code_expires_at > now()
    AND t.device_token IS NULL
    AND t.is_active = true
  LIMIT 1;

  IF _terminal.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired pairing code';
  END IF;

  IF NOT public.is_venue_staff(auth.uid(), _terminal.venue_id) THEN
    RAISE EXCEPTION 'Not authorised for this venue';
  END IF;

  _new_token := gen_random_uuid();

  UPDATE public.display_terminals
  SET device_token = _new_token,
      paired_at = now(),
      paired_by = auth.uid(),
      last_seen_at = now(),
      user_agent = _user_agent,
      pairing_code = NULL,
      pairing_code_expires_at = NULL
  WHERE id = _terminal.id;

  RETURN QUERY
  SELECT
    _terminal.id AS terminal_id,
    _new_token AS device_token,
    _terminal.name AS terminal_name,
    COALESCE(
      (SELECT array_agg(dta.display_area_id)
       FROM public.display_terminal_areas dta
       WHERE dta.terminal_id = _terminal.id),
      ARRAY[]::uuid[]
    ) AS area_ids;
END;
$$;