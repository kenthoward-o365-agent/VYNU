
-- venue_payment_config: revoke column-level SELECT on secret columns
REVOKE SELECT (api_key_test, api_key_live, client_key_test, client_key_live, hmac_key)
  ON public.venue_payment_config FROM anon, authenticated, PUBLIC;

-- Re-grant SELECT on all non-secret columns to authenticated (RLS still applies)
GRANT SELECT (
  id, venue_id, provider, environment, is_active,
  merchant_account, merchant_status,
  apple_pay_merchant_id, google_pay_merchant_id,
  api_key_test_secret_id, api_key_live_secret_id,
  client_key_test_secret_id, client_key_live_secret_id,
  hmac_key_secret_id,
  created_at, updated_at
) ON public.venue_payment_config TO authenticated;

-- venue_pos_integrations: revoke column-level SELECT on secret columns
REVOKE SELECT (webhook_secret, token_cache, secrets_map, client_secret_ref)
  ON public.venue_pos_integrations FROM anon, authenticated, PUBLIC;
