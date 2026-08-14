
-- 1. menu_items: hide internal cost/POS columns from anonymous diners
REVOKE SELECT (food_cost, pos_id, plu, pos_tags, pos_allergens) ON public.menu_items FROM anon;

-- 2. staff_alerts: tighten anonymous insert validation on diner_id
DROP POLICY IF EXISTS "Anyone can create alerts" ON public.staff_alerts;
CREATE POLICY "Anyone can create alerts" ON public.staff_alerts
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    venue_id IS NOT NULL
    AND (
      (auth.uid() IS NULL AND diner_id IS NULL)
      OR (auth.uid() IS NOT NULL AND (diner_id IS NULL OR diner_id = public.get_user_diner_profile_id()))
    )
  );

-- 3. venue_billing_accounts: restrict reads to managers
DROP POLICY IF EXISTS "Venue staff can read their own billing account" ON public.venue_billing_accounts;
CREATE POLICY "Venue managers can read their billing account"
  ON public.venue_billing_accounts
  FOR SELECT TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- 4. venue_payment_methods: restrict reads to managers
DROP POLICY IF EXISTS "Venue staff can read their own payment methods" ON public.venue_payment_methods;
CREATE POLICY "Venue managers can read their payment methods"
  ON public.venue_payment_methods
  FOR SELECT TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- 5. api_webhooks: hide raw signing secret from Data API
REVOKE SELECT (secret) ON public.api_webhooks FROM authenticated, anon;

-- 6. venue_payment_config: hide payment-gateway secret columns from Data API
REVOKE SELECT (api_key_test, api_key_live, hmac_key, client_key_test, client_key_live)
  ON public.venue_payment_config FROM authenticated, anon;

-- 7. venue_pos_integrations: hide POS secret columns from Data API
REVOKE SELECT (webhook_secret, client_secret_ref, token_cache, secrets_map, api_key_ref)
  ON public.venue_pos_integrations FROM authenticated, anon;

-- 8. RPC: masked metadata for the venue POS integration
CREATE OR REPLACE FUNCTION public.get_venue_pos_integration_meta(_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.venue_pos_integrations%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'tabless_admin'::app_role)
          OR public.is_venue_manager(auth.uid(), _venue_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO _row FROM public.venue_pos_integrations WHERE venue_id = _venue_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', _row.id,
    'venue_id', _row.venue_id,
    'pos_provider', _row.pos_provider,
    'endpoint_url', _row.endpoint_url,
    'last_sync_at', _row.last_sync_at,
    'sync_status', _row.sync_status,
    'config', _row.config,
    'location_id', _row.location_id,
    'account_id', _row.account_id,
    'client_id', _row.client_id,
    'provider_id', _row.provider_id,
    'connection_status', _row.connection_status,
    'last_error', _row.last_error,
    'breaker_state', _row.breaker_state,
    'sync_pos_to_us', _row.sync_pos_to_us,
    'sync_us_to_pos', _row.sync_us_to_pos,
    'auto_push_orders', _row.auto_push_orders,
    'last_menu_pull_at', _row.last_menu_pull_at,
    'last_webhook_at', _row.last_webhook_at,
    'has_api_key_ref', _row.api_key_ref IS NOT NULL,
    'has_client_secret_ref', _row.client_secret_ref IS NOT NULL,
    'has_webhook_secret', _row.webhook_secret IS NOT NULL,
    'secrets_keys', COALESCE(
      (SELECT jsonb_agg(k) FROM jsonb_object_keys(COALESCE(_row.secrets_map, '{}'::jsonb)) AS k),
      '[]'::jsonb
    )
  );
END;
$$;

-- 9. RPC: write-only update for POS secret refs
CREATE OR REPLACE FUNCTION public.update_venue_pos_secret_refs(
  _venue_id uuid,
  _api_key_ref text DEFAULT NULL,
  _client_secret_ref text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_venue_manager(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.venue_pos_integrations
    SET api_key_ref = CASE WHEN _api_key_ref IS NOT NULL AND _api_key_ref <> '' THEN _api_key_ref ELSE api_key_ref END,
        client_secret_ref = CASE WHEN _client_secret_ref IS NOT NULL AND _client_secret_ref <> '' THEN _client_secret_ref ELSE client_secret_ref END,
        updated_at = now()
  WHERE venue_id = _venue_id;
END;
$$;

-- 10. RPC: masked metadata for venue payment config
CREATE OR REPLACE FUNCTION public.get_venue_payment_config_meta(_venue_id uuid, _provider text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.venue_payment_config%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'tabless_admin'::app_role)
          OR public.is_venue_manager(auth.uid(), _venue_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO _row FROM public.venue_payment_config
  WHERE venue_id = _venue_id
    AND (_provider IS NULL OR provider = _provider)
  ORDER BY (provider = 'ordrpayments') DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', _row.id,
    'venue_id', _row.venue_id,
    'provider', _row.provider,
    'environment', _row.environment,
    'merchant_account', _row.merchant_account,
    'is_active', _row.is_active,
    'capture_mode', _row.capture_mode,
    'statement_descriptor', _row.statement_descriptor,
    'country_code', _row.country_code,
    'default_currency', _row.default_currency,
    'merchant_status', _row.merchant_status,
    'merchant_id_ordrpay', _row.merchant_id_ordrpay,
    'apple_pay_merchant_id', _row.apple_pay_merchant_id,
    'google_pay_merchant_id', _row.google_pay_merchant_id,
    'has_api_key_test', _row.api_key_test IS NOT NULL,
    'has_api_key_live', _row.api_key_live IS NOT NULL,
    'has_client_key_test', _row.client_key_test IS NOT NULL,
    'has_client_key_live', _row.client_key_live IS NOT NULL,
    'has_hmac_key', _row.hmac_key IS NOT NULL
  );
END;
$$;

-- 11. RPC: api_webhooks listing without secret value
CREATE OR REPLACE FUNCTION public.list_api_webhooks_safe()
RETURNS TABLE(
  id uuid, partner_id uuid, venue_id uuid, url text, events text[],
  is_active boolean, last_delivery_at timestamptz, last_delivery_status text,
  created_at timestamptz, updated_at timestamptz, has_secret boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, partner_id, venue_id, url, events, is_active,
         last_delivery_at, last_delivery_status, created_at, updated_at,
         (secret IS NOT NULL)
  FROM public.api_webhooks
  WHERE public.has_role(auth.uid(), 'tabless_admin'::app_role)
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_pos_integration_meta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_venue_pos_secret_refs(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_payment_config_meta(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_api_webhooks_safe() TO authenticated;
