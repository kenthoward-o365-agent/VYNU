
-- Add site_id column to venues
ALTER TABLE public.venues ADD COLUMN site_id text;

-- Function to generate a random site ID like 'VNU-7X4K2'
CREATE OR REPLACE FUNCTION public.generate_site_id()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i integer;
  exists_already boolean;
BEGIN
  LOOP
    result := 'VNU-';
    FOR i IN 1..5 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.venues WHERE site_id = result) INTO exists_already;
    IF NOT exists_already THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

-- Backfill existing venues with unique site IDs
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT id FROM public.venues WHERE site_id IS NULL LOOP
    UPDATE public.venues SET site_id = public.generate_site_id() WHERE id = v.id;
  END LOOP;
END;
$$;

-- Now make site_id NOT NULL and UNIQUE
ALTER TABLE public.venues ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE public.venues ALTER COLUMN site_id SET DEFAULT public.generate_site_id();
CREATE UNIQUE INDEX idx_venues_site_id ON public.venues (site_id);

-- Public lookup function so the login form can verify a site ID
CREATE OR REPLACE FUNCTION public.lookup_venue_by_site_id(_site_id text)
RETURNS TABLE(venue_id uuid, venue_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, name FROM public.venues WHERE site_id = upper(trim(_site_id)) AND is_active = true LIMIT 1;
$$;
