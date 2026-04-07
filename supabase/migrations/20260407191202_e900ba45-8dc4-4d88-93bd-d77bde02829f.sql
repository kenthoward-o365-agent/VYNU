-- Backfill: create venue_groups record for existing parent venues that lack one
DO $$
DECLARE
  _venue RECORD;
  _group_id uuid;
BEGIN
  FOR _venue IN SELECT id, name FROM public.venues WHERE venue_type = 'parent' AND group_id IS NULL
  LOOP
    INSERT INTO public.venue_groups (name) VALUES (_venue.name) RETURNING id INTO _group_id;
    UPDATE public.venues SET group_id = _group_id WHERE id = _venue.id;
  END LOOP;
END;
$$;