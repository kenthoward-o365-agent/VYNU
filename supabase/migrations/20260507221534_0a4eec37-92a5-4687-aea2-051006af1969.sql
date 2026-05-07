ALTER TABLE public.venue_staff
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS venue_staff_one_primary_per_user
  ON public.venue_staff (user_id)
  WHERE is_primary = true AND is_active = true;

WITH single AS (
  SELECT user_id
  FROM public.venue_staff
  WHERE is_active = true
  GROUP BY user_id
  HAVING count(*) = 1
)
UPDATE public.venue_staff vs
SET is_primary = true
FROM single s
WHERE vs.user_id = s.user_id
  AND vs.is_active = true
  AND vs.is_primary = false;

CREATE OR REPLACE FUNCTION public.set_primary_venue(_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venue_staff
    WHERE user_id = _uid AND venue_id = _venue_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'no access to venue %', _venue_id;
  END IF;

  UPDATE public.venue_staff
    SET is_primary = false
    WHERE user_id = _uid AND is_primary = true;

  UPDATE public.venue_staff
    SET is_primary = true
    WHERE user_id = _uid AND venue_id = _venue_id AND is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_primary_venue(uuid) TO authenticated;