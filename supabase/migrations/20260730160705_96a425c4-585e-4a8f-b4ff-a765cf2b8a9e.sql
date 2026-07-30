UPDATE public.menu_categories c
SET menu_id = (
  SELECT m.id FROM public.venue_menus m
  WHERE m.venue_id = c.venue_id
  ORDER BY m.display_order NULLS LAST, m.created_at
  LIMIT 1
)
WHERE c.menu_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_default_menu_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.menu_id IS NULL THEN
    SELECT m.id INTO NEW.menu_id
    FROM public.venue_menus m
    WHERE m.venue_id = NEW.venue_id
    ORDER BY m.display_order NULLS LAST, m.created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_default_menu_id() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_menu_categories_default_menu ON public.menu_categories;
CREATE TRIGGER trg_menu_categories_default_menu
BEFORE INSERT ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.set_default_menu_id();