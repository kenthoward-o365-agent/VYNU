-- Add a venue/item-scoped public helper for consumer item customisation.
CREATE OR REPLACE FUNCTION public.get_item_modifiers_public(
  _venue_id uuid,
  _menu_item_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH item_mod_rows AS (
    SELECT mim.modifier_category_id, mim.is_required, mim.display_order
    FROM public.menu_item_modifiers mim
    JOIN public.menu_items mi ON mi.id = mim.menu_item_id
    WHERE mim.menu_item_id = _menu_item_id
      AND mi.venue_id = _venue_id
      AND mi.is_available = true
  ), category_rows AS (
    SELECT
      mc.id,
      mc.name,
      mc.display_order,
      mc.selection_type,
      mc.min_selection,
      mc.max_selection,
      imr.is_required,
      COALESCE(imr.display_order, 0) AS item_display_order
    FROM item_mod_rows imr
    JOIN public.modifier_categories mc ON mc.id = imr.modifier_category_id
    WHERE mc.venue_id = _venue_id
      AND mc.is_active = true
  ), modifier_rows AS (
    SELECT
      m.id,
      m.category_id,
      m.name,
      m.price,
      m.display_order,
      m.is_active
    FROM public.modifiers m
    JOIN category_rows cr ON cr.id = m.category_id
    WHERE m.venue_id = _venue_id
      AND m.is_active = true
  )
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(to_jsonb(category_rows) ORDER BY item_display_order, display_order)
      FROM category_rows
    ), '[]'::jsonb),
    'modifiers', COALESCE((
      SELECT jsonb_agg(to_jsonb(modifier_rows) ORDER BY display_order)
      FROM modifier_rows
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_item_modifiers_public(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_item_modifiers_public(uuid, uuid) TO anon, authenticated;

-- Remove broad public menu-internal policies; consumer menu reads go through get_menu_snapshot and get_item_modifiers_public.
DROP POLICY IF EXISTS "menu_categories_select_active_public" ON public.menu_categories;
DROP POLICY IF EXISTS "Public can view category display areas" ON public.menu_category_display_areas;
DROP POLICY IF EXISTS "Public can view menu item modifiers" ON public.menu_item_modifiers;
DROP POLICY IF EXISTS "Public can view modifier categories" ON public.modifier_categories;
DROP POLICY IF EXISTS "Public can view active modifier categories" ON public.modifier_categories;
DROP POLICY IF EXISTS "Public can view modifiers" ON public.modifiers;
DROP POLICY IF EXISTS "Public can view active modifiers" ON public.modifiers;

REVOKE SELECT ON public.menu_categories FROM anon;
REVOKE SELECT ON public.menu_category_display_areas FROM anon;
REVOKE SELECT ON public.menu_item_modifiers FROM anon;
REVOKE SELECT ON public.modifier_categories FROM anon;
REVOKE SELECT ON public.modifiers FROM anon;

-- Keep authenticated staff/operator access governed by existing venue-scoped policies.