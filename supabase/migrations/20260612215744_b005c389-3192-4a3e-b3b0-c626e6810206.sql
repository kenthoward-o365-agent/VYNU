
-- 1. venue_payment_config: revoke SELECT on secret columns
REVOKE SELECT (api_key_test, api_key_live, client_key_test, client_key_live, hmac_key)
  ON public.venue_payment_config FROM authenticated, anon, PUBLIC;

GRANT SELECT (
  id, venue_id, provider, environment, merchant_account, merchant_status,
  is_active, capture_mode, statement_descriptor, country_code, default_currency,
  apple_pay_merchant_id, google_pay_merchant_id,
  api_key_test_secret_id, api_key_live_secret_id,
  client_key_test_secret_id, client_key_live_secret_id, hmac_key_secret_id,
  created_at, updated_at
) ON public.venue_payment_config TO authenticated;

UPDATE public.venue_payment_config
   SET api_key_test = NULL, api_key_live = NULL,
       client_key_test = NULL, client_key_live = NULL, hmac_key = NULL
 WHERE api_key_test IS NOT NULL OR api_key_live IS NOT NULL
    OR client_key_test IS NOT NULL OR client_key_live IS NOT NULL
    OR hmac_key IS NOT NULL;

-- 2. venue_pos_integrations: revoke SELECT on secret columns
REVOKE SELECT (webhook_secret, token_cache, secrets_map, client_secret_ref)
  ON public.venue_pos_integrations FROM authenticated, anon, PUBLIC;

GRANT SELECT (
  id, venue_id, provider_id, pos_provider, endpoint_url, location_id, account_id,
  client_id, api_key_ref, config, connection_status, sync_status,
  last_sync_at, last_error, last_menu_pull_at, last_webhook_at,
  auto_push_orders, sync_pos_to_us, sync_us_to_pos,
  breaker_state, breaker_failures, breaker_opened_at,
  webhook_secret_id, created_at, updated_at
) ON public.venue_pos_integrations TO authenticated;

-- 3. menu_item_display_areas: drop broad anon SELECT
DROP POLICY IF EXISTS "Public can view item display areas" ON public.menu_item_display_areas;
REVOKE SELECT ON public.menu_item_display_areas FROM anon;
