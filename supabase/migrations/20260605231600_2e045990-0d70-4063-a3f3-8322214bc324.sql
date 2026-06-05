
-- 1) api_webhooks: hide raw secret from Data API; admins must use list_api_webhooks_safe RPC
REVOKE SELECT (secret) ON public.api_webhooks FROM anon, authenticated;

-- 2) venue_payment_config: hide payment credentials from Data API; use get_venue_payment_config_meta RPC
REVOKE SELECT (api_key_test, api_key_live, hmac_key, client_key_test, client_key_live)
  ON public.venue_payment_config FROM anon, authenticated;

-- 3) venue_pos_integrations: hide POS secrets from Data API; use get_venue_pos_integration_meta RPC
REVOKE SELECT (webhook_secret, client_secret_ref, token_cache, secrets_map, api_key_ref)
  ON public.venue_pos_integrations FROM anon, authenticated;

-- 4) venue_display_areas: hide internal throttle config from anonymous diners.
--    Anonymous QR-flow callers can still read name/prep time/wait flag.
REVOKE SELECT (
  throttle_enabled,
  throttle_mode,
  throttle_max_orders,
  throttle_window_minutes,
  throttle_block_until,
  throttle_block_timeout_minutes
) ON public.venue_display_areas FROM anon;
