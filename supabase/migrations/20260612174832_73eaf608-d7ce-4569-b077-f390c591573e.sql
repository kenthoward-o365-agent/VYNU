
-- 1. Drop overly-broad venues policy. Diners read via RPCs; staff via venues_select_internal_full.
DROP POLICY IF EXISTS "venues_select_active_authenticated" ON public.venues;

-- 2. RPC: list loyalty-program venues for diner profile (safe columns only)
CREATE OR REPLACE FUNCTION public.list_diner_loyalty_venues(
  _group_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _venue_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE(id uuid, name text, city text, state text, group_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.name, v.city, v.state, v.group_id
  FROM public.venues v
  WHERE v.is_active = true
    AND v.venue_type <> 'parent'
    AND (
      (_venue_ids IS NOT NULL AND array_length(_venue_ids, 1) > 0 AND v.id = ANY(_venue_ids))
      OR (_group_ids IS NOT NULL AND array_length(_group_ids, 1) > 0 AND v.group_id = ANY(_group_ids))
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_diner_loyalty_venues(uuid[], uuid[]) TO authenticated, anon;

-- 3. Lock down menu_items.food_cost — staff-only via RPC
REVOKE SELECT (food_cost) ON public.menu_items FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.get_menu_item_food_costs(_venue_id uuid)
RETURNS TABLE(id uuid, food_cost numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'tabless_admin'::app_role)
          OR public.is_venue_staff(auth.uid(), _venue_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT mi.id, mi.food_cost
    FROM public.menu_items mi
    WHERE mi.venue_id = _venue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_menu_item_food_costs(uuid) TO authenticated;
