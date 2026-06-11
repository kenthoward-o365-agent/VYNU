
-- 1. crm_campaign_sends: restrict staff SELECT to managers
DROP POLICY IF EXISTS "Staff view own venue sends" ON public.crm_campaign_sends;
CREATE POLICY "Managers view own venue sends"
  ON public.crm_campaign_sends FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_manager(auth.uid(), venue_id)
  );

-- 2. crm_suppression: restrict staff SELECT to managers
DROP POLICY IF EXISTS "Staff view suppression for their venue" ON public.crm_suppression;
CREATE POLICY "Managers view suppression for their venue"
  ON public.crm_suppression FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_manager(auth.uid(), venue_id)
  );

-- 3. Tighten partition SELECT policies from public -> authenticated
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'api_request_log_y2026m06','api_request_log_y2026m07',
      'api_request_log_y2026m08','api_request_log_y2026m09',
      'pos_sync_log_y2026m06','pos_sync_log_y2026m07',
      'pos_sync_log_y2026m08','pos_sync_log_y2026m09'
    ])
  LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='SELECT' AND 'public' = ANY(roles)
    LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- 4. venues: revoke sensitive internal columns from anon
REVOKE SELECT (subscription_status, subscription_plan, subscription_notes, went_live_at)
  ON public.venues FROM anon;

-- 5. Re-assert secret column revokes (idempotent safety net)
REVOKE SELECT (api_key_test, api_key_live, hmac_key, client_key_test, client_key_live)
  ON public.venue_payment_config FROM authenticated, anon;
REVOKE SELECT (webhook_secret, token_cache, secrets_map, api_key_ref, client_secret_ref)
  ON public.venue_pos_integrations FROM authenticated, anon;
