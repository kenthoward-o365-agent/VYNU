-- Converge on Vault-only payment credentials.
--
-- The plaintext credential columns on venue_payment_config (api_key_test,
-- api_key_live, client_key_test, client_key_live, hmac_key) were dropped from the
-- live database out-of-band after 20260612164708 backfilled their values into Vault
-- and 20260612215744 nulled them out. No migration in this repo ever performed the
-- DROP, so the migration history and the deployed schema had diverged and code that
-- still named those columns failed with 42703 ("column does not exist") — silently,
-- because both call sites discarded the error:
--
--   * admin-set-payment-credentials `get` selected all five, so the whole SELECT
--     failed and every credential rendered as "Not set" even when correctly stored.
--   * get_venue_payment_config_meta below reads them off a %ROWTYPE record, so the
--     venue-facing Settings -> Payments tab silently fell back to defaults.
--
-- This migration drops the columns for real (idempotently) so every environment
-- matches production, and rewrites the RPC to derive presence from the Vault
-- reference columns instead.

-- has_* now reflects the Vault reference, which is the only place a credential
-- lives. The returned shape is unchanged, so callers need no update.
--
-- Replaced BEFORE the columns are dropped so this function never references a
-- dropped column, even momentarily. Postgres records no dependency from a PL/pgSQL
-- body (or a %ROWTYPE declaration) to a column, so the DROP below would succeed
-- either way and both statements are in one transaction — this is for clarity.
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
    'has_api_key_test', _row.api_key_test_secret_id IS NOT NULL,
    'has_api_key_live', _row.api_key_live_secret_id IS NOT NULL,
    'has_client_key_test', _row.client_key_test_secret_id IS NOT NULL,
    'has_client_key_live', _row.client_key_live_secret_id IS NOT NULL,
    'has_hmac_key', _row.hmac_key_secret_id IS NOT NULL
  );
END;
$$;

-- Re-assert the grants established by 20260730130722 / 20260730232240: anonymous
-- callers blocked, signed-in access retained. CREATE OR REPLACE preserves existing
-- privileges, so this is belt-and-braces rather than a change in reachability.
REVOKE ALL ON FUNCTION public.get_venue_payment_config_meta(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_payment_config_meta(uuid, text) TO authenticated, service_role;

-- Now retire the columns themselves. Idempotent: production already dropped these
-- out-of-band, and their values were backfilled into Vault by 20260612164708 and
-- nulled by 20260612215744, so there is nothing left to lose.
ALTER TABLE public.venue_payment_config
  DROP COLUMN IF EXISTS api_key_test,
  DROP COLUMN IF EXISTS api_key_live,
  DROP COLUMN IF EXISTS client_key_test,
  DROP COLUMN IF EXISTS client_key_live,
  DROP COLUMN IF EXISTS hmac_key;
