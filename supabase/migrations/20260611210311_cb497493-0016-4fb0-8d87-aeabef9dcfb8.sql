
-- 1. venue_payment_config: column-level SELECT for authenticated (no secrets)
REVOKE SELECT ON public.venue_payment_config FROM authenticated;
GRANT SELECT (
  id, venue_id, provider, environment, is_active,
  merchant_account, merchant_status, capture_mode,
  statement_descriptor, country_code, default_currency,
  apple_pay_merchant_id, google_pay_merchant_id,
  created_at, updated_at
) ON public.venue_payment_config TO authenticated;
-- service_role retains full access via existing GRANT ALL

-- 2. venue_pos_integrations: column-level SELECT for authenticated (no secrets)
REVOKE SELECT ON public.venue_pos_integrations FROM authenticated;
GRANT SELECT (
  id, venue_id, pos_provider, provider_id, endpoint_url,
  location_id, account_id, client_id,
  connection_status, sync_status, breaker_state,
  sync_pos_to_us, sync_us_to_pos, auto_push_orders,
  last_sync_at, last_menu_pull_at, last_webhook_at, last_error,
  config, created_at, updated_at
) ON public.venue_pos_integrations TO authenticated;
-- service_role retains full access via existing GRANT ALL
-- Excluded (secret) columns: webhook_secret, token_cache, secrets_map,
-- api_key_ref, client_secret_ref. Read via get_venue_pos_integration_meta RPC.

-- 3. diner_web_sessions: drop the over-broad anon SELECT policy.
-- Client now generates the session id locally so no read-back is required.
DROP POLICY IF EXISTS "Anon can read own anonymous session" ON public.diner_web_sessions;
DROP POLICY IF EXISTS "Anon can read recent open anonymous sessions" ON public.diner_web_sessions;
