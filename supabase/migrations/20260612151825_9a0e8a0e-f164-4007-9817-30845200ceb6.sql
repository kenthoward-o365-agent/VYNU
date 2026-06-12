
-- 1. Revoke secret columns on venue_payment_config from non-service roles
REVOKE SELECT (api_key_live, api_key_test, client_key_live, client_key_test, hmac_key)
  ON public.venue_payment_config FROM authenticated, anon;

-- 2. Revoke secret columns on venue_pos_integrations
REVOKE SELECT (webhook_secret, client_secret_ref, api_key_ref, secrets_map)
  ON public.venue_pos_integrations FROM authenticated, anon;

-- 3. Recreate diner_venue_stats SELECT policies scoped to authenticated
DROP POLICY IF EXISTS "Admins view all diner_venue_stats" ON public.diner_venue_stats;
DROP POLICY IF EXISTS "Diners view own diner_venue_stats" ON public.diner_venue_stats;
DROP POLICY IF EXISTS "Staff view diner_venue_stats for their venue" ON public.diner_venue_stats;

CREATE POLICY "Admins view all diner_venue_stats" ON public.diner_venue_stats
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tabless_admin'::app_role));
CREATE POLICY "Diners view own diner_venue_stats" ON public.diner_venue_stats
  FOR SELECT TO authenticated USING (diner_id = get_user_diner_profile_id());
CREATE POLICY "Staff view diner_venue_stats for their venue" ON public.diner_venue_stats
  FOR SELECT TO authenticated USING (is_venue_staff(auth.uid(), venue_id));

-- 4. Recreate partition log policies scoped to authenticated
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_request_log_y2026m06','api_request_log_y2026m07',
    'api_request_log_y2026m08','api_request_log_y2026m09'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins view request log part" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admins view request log part" ON public.%I FOR SELECT TO authenticated USING (has_role(auth.uid(), ''tabless_admin''::app_role))', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'pos_sync_log_y2026m06','pos_sync_log_y2026m07',
    'pos_sync_log_y2026m08','pos_sync_log_y2026m09'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins view sync log part" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Managers view sync log part" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view sync log part" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admins view sync log part" ON public.%I FOR SELECT TO authenticated USING (has_role(auth.uid(), ''tabless_admin''::app_role))', t);
    EXECUTE format('CREATE POLICY "Managers view sync log part" ON public.%I FOR SELECT TO authenticated USING (is_venue_manager(auth.uid(), venue_id))', t);
    EXECUTE format('CREATE POLICY "Staff view sync log part" ON public.%I FOR SELECT TO authenticated USING (is_venue_staff(auth.uid(), venue_id))', t);
  END LOOP;
END $$;

-- 5. Remove anon direct read on tables; diners reach their table via SECURITY DEFINER RPCs
DROP POLICY IF EXISTS tables_select_public_active ON public.tables;
REVOKE SELECT ON public.tables FROM anon;

-- 6. Restrict anon column access on venues to minimal public fields.
-- Keep the existing venues_select_active_anon policy but use column GRANTs to hide sensitive fields.
REVOKE SELECT ON public.venues FROM anon;
GRANT SELECT (
  id, name, logo_url, venue_type, operating_hours, is_active,
  city, state, country, postcode, timezone, group_id, site_id,
  is_live, went_live_at, menu_source, created_at, updated_at
) ON public.venues TO anon;
