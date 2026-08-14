
DROP POLICY IF EXISTS "Admins view request log part" ON public.api_request_log_y2026m09;
CREATE POLICY "Admins view request log part" ON public.api_request_log_y2026m09
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

DROP POLICY IF EXISTS "Admins view sync log part" ON public.pos_sync_log_y2026m09;
CREATE POLICY "Admins view sync log part" ON public.pos_sync_log_y2026m09
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

DROP POLICY IF EXISTS "Managers view sync log part" ON public.pos_sync_log_y2026m09;
CREATE POLICY "Managers view sync log part" ON public.pos_sync_log_y2026m09
  FOR SELECT TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

DROP POLICY IF EXISTS "Staff view sync log part" ON public.pos_sync_log_y2026m09;
CREATE POLICY "Staff view sync log part" ON public.pos_sync_log_y2026m09
  FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));
