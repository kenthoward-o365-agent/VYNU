
-- Assign 1000 to the first venue
WITH first_venue AS (
  SELECT id FROM public.venues ORDER BY created_at ASC LIMIT 1
)
UPDATE public.venues SET site_id = '1000' FROM first_venue WHERE venues.id = first_venue.id;

-- Assign 1001 to the second venue
WITH second_venue AS (
  SELECT id FROM public.venues ORDER BY created_at ASC OFFSET 1 LIMIT 1
)
UPDATE public.venues SET site_id = '1001' FROM second_venue WHERE venues.id = second_venue.id;
