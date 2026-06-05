
ALTER POLICY "Managers can view pos integrations" ON public.venue_pos_integrations TO authenticated;

ALTER POLICY "Staff can view venue terminals" ON public.display_terminals TO authenticated;
ALTER POLICY "Managers can create terminals" ON public.display_terminals TO authenticated;
ALTER POLICY "Managers can update terminals" ON public.display_terminals TO authenticated;
ALTER POLICY "Managers can delete terminals" ON public.display_terminals TO authenticated;

ALTER POLICY "Staff can view terminal areas" ON public.display_terminal_areas TO authenticated;
ALTER POLICY "Managers can write terminal areas" ON public.display_terminal_areas TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pos_sync_log_y2026m06','pos_sync_log_y2026m07','pos_sync_log_y2026m08','pos_sync_log_y2026m09']
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', 'Staff view sync log part', t);
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', 'Managers view sync log part', t);
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', 'Admins view sync log part', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['api_request_log_y2026m06','api_request_log_y2026m07','api_request_log_y2026m08','api_request_log_y2026m09']
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', 'Admins view request log part', t);
  END LOOP;
END $$;
