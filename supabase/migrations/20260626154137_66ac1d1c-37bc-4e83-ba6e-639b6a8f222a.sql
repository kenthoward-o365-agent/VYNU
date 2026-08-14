ALTER POLICY "Admins view sync log part" ON public.pos_sync_log_y2026m09 TO authenticated;
ALTER POLICY "Managers view sync log part" ON public.pos_sync_log_y2026m09 TO authenticated;
ALTER POLICY "Staff view sync log part" ON public.pos_sync_log_y2026m09 TO authenticated;
REVOKE ALL ON public.pos_sync_log_y2026m09 FROM PUBLIC, anon;
GRANT SELECT ON public.pos_sync_log_y2026m09 TO authenticated;
GRANT ALL ON public.pos_sync_log_y2026m09 TO service_role;