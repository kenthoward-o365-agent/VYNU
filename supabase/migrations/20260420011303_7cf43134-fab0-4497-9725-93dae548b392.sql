DROP POLICY IF EXISTS "System can insert throttle log" ON public.order_throttle_log;

CREATE POLICY "Staff can insert throttle log"
  ON public.order_throttle_log FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_staff(auth.uid(), venue_id));

-- Anonymous diners place orders; the trigger runs as SECURITY DEFINER so it
-- bypasses RLS, but we still need an anon insert path for the trigger
-- when the order is created by an anon user. The SECURITY DEFINER function
-- already bypasses RLS, so no anon policy is required.