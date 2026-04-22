CREATE OR REPLACE FUNCTION public.generate_site_id()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_id integer;
BEGIN
  SELECT COALESCE(MAX(site_id::integer), 999) + 1
  INTO next_id
  FROM public.venues
  WHERE site_id ~ '^[0-9]+$';

  WHILE EXISTS (SELECT 1 FROM public.venues WHERE site_id = next_id::text) LOOP
    next_id := next_id + 1;
  END LOOP;

  RETURN next_id::text;
END;
$function$;