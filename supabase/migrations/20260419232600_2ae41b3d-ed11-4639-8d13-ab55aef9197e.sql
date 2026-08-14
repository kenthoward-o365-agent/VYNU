CREATE OR REPLACE FUNCTION public.enforce_max_3_category_areas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.menu_category_display_areas WHERE category_id = NEW.category_id) >= 3 THEN
    RAISE EXCEPTION 'A category can be assigned to at most 3 display areas';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_max_3_item_areas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.menu_item_display_areas WHERE menu_item_id = NEW.menu_item_id) >= 3 THEN
    RAISE EXCEPTION 'An item can be assigned to at most 3 display areas';
  END IF;
  RETURN NEW;
END;
$$;