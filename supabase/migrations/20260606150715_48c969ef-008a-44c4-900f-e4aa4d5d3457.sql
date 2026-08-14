-- 1) crm_suppression: restrict staff policy to authenticated only
DROP POLICY IF EXISTS "Staff view suppression for their venue" ON public.crm_suppression;
CREATE POLICY "Staff view suppression for their venue"
  ON public.crm_suppression
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND ((venue_id IS NULL) OR is_venue_staff(auth.uid(), venue_id))
  );

-- 2) venue_display_areas: revoke throttle-related columns from anon
REVOKE SELECT (
  throttle_enabled,
  throttle_mode,
  throttle_max_orders,
  throttle_window_minutes,
  throttle_block_timeout_minutes,
  throttle_block_until
) ON public.venue_display_areas FROM anon;

-- 3) menu_items: revoke internal cost / POS columns from anon
REVOKE SELECT (food_cost, pos_id, plu, pos_tags) ON public.menu_items FROM anon;