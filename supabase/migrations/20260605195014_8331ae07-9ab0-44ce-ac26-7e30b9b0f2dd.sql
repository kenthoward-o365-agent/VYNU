
-- M-1: menu_items — scope public SELECT to available items only, add staff full-row policy.
DROP POLICY IF EXISTS "menu_items_select_public" ON public.menu_items;

CREATE POLICY "menu_items_select_public_available"
ON public.menu_items FOR SELECT
TO anon, authenticated
USING (is_available = true);

CREATE POLICY "menu_items_select_staff_full"
ON public.menu_items FOR SELECT
TO authenticated
USING (is_venue_staff(auth.uid(), venue_id));

-- Lock down proprietary cost columns from anonymous viewers (defense-in-depth;
-- anon-facing UIs never need food_cost).
REVOKE SELECT (food_cost) ON public.menu_items FROM anon;

-- M-2: tables — scope public SELECT to active tables, add staff full-row policy.
DROP POLICY IF EXISTS "tables_select_public" ON public.tables;

CREATE POLICY "tables_select_public_active"
ON public.tables FOR SELECT
TO anon, authenticated
USING (COALESCE(status, 'available') <> 'disabled');

CREATE POLICY "tables_select_staff_full"
ON public.tables FOR SELECT
TO authenticated
USING (is_venue_staff(auth.uid(), venue_id));

-- M-3: orders INSERT — require the target venue exists and is active.
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

CREATE POLICY "Anyone can create orders for live venues"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (
  venue_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = venue_id
      AND COALESCE(v.is_active, true) = true
  )
);

-- H-4: venue_payment_config — explicit manager view policy (don't rely solely on column REVOKEs).
DROP POLICY IF EXISTS "Managers can view payment config" ON public.venue_payment_config;

CREATE POLICY "Managers can view payment config"
ON public.venue_payment_config FOR SELECT
TO authenticated
USING (is_venue_manager(auth.uid(), venue_id));
