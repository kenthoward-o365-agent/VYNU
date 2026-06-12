
ALTER TABLE public.venue_payment_config
  ADD COLUMN IF NOT EXISTS api_key_test_secret_id    uuid,
  ADD COLUMN IF NOT EXISTS api_key_live_secret_id    uuid,
  ADD COLUMN IF NOT EXISTS client_key_test_secret_id uuid,
  ADD COLUMN IF NOT EXISTS client_key_live_secret_id uuid,
  ADD COLUMN IF NOT EXISTS hmac_key_secret_id        uuid;

ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret_id uuid;

CREATE OR REPLACE FUNCTION public._payment_secret_column(_field text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _field
    WHEN 'api_key_test'    THEN 'api_key_test_secret_id'
    WHEN 'api_key_live'    THEN 'api_key_live_secret_id'
    WHEN 'client_key_test' THEN 'client_key_test_secret_id'
    WHEN 'client_key_live' THEN 'client_key_live_secret_id'
    WHEN 'hmac_key'        THEN 'hmac_key_secret_id'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.set_payment_secret(_venue_id uuid, _field text, _value text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _col text := public._payment_secret_column(_field); _existing uuid; _new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised'; END IF;
  IF _col IS NULL THEN RAISE EXCEPTION 'Invalid field: %', _field; END IF;
  IF _value IS NULL OR length(trim(_value)) = 0 THEN RAISE EXCEPTION 'Value required'; END IF;

  EXECUTE format('SELECT %I FROM public.venue_payment_config WHERE venue_id=$1 AND provider IN ($2,$3) ORDER BY (provider=$2) DESC LIMIT 1', _col)
    INTO _existing USING _venue_id, 'ordrpayments', 'adyen';

  IF _existing IS NOT NULL THEN
    UPDATE vault.secrets SET secret = _value, updated_at = now() WHERE id = _existing;
    RETURN _existing;
  END IF;

  _new_id := vault.create_secret(_value,
    'payment:'||_venue_id::text||':'||_field||':'||extract(epoch from now())::bigint::text,
    'venue_payment_config.'||_field);

  EXECUTE format('UPDATE public.venue_payment_config SET %I=$1, updated_at=now() WHERE venue_id=$2 AND provider IN ($3,$4)', _col)
    USING _new_id, _venue_id, 'ordrpayments', 'adyen';
  RETURN _new_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_payment_secret(_venue_id uuid, _field text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _col text := public._payment_secret_column(_field); _sid uuid; _val text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised'; END IF;
  IF _col IS NULL THEN RAISE EXCEPTION 'Invalid field: %', _field; END IF;

  EXECUTE format('SELECT %I FROM public.venue_payment_config WHERE venue_id=$1 AND provider IN ($2,$3) ORDER BY (provider=$2) DESC LIMIT 1', _col)
    INTO _sid USING _venue_id, 'ordrpayments', 'adyen';

  IF _sid IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO _val FROM vault.decrypted_secrets WHERE id = _sid;
  RETURN _val;
END $$;

CREATE OR REPLACE FUNCTION public.set_pos_webhook_secret(_venue_id uuid, _value text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existing uuid; _new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'tabless_admin'::app_role) OR public.is_venue_manager(auth.uid(), _venue_id)) THEN
    RAISE EXCEPTION 'Not authorised'; END IF;
  IF _value IS NULL OR length(trim(_value)) = 0 THEN RAISE EXCEPTION 'Value required'; END IF;

  SELECT webhook_secret_id INTO _existing FROM public.venue_pos_integrations WHERE venue_id = _venue_id;
  IF _existing IS NOT NULL THEN
    UPDATE vault.secrets SET secret = _value, updated_at = now() WHERE id = _existing;
    RETURN _existing;
  END IF;
  _new_id := vault.create_secret(_value,
    'pos_webhook:'||_venue_id::text||':'||extract(epoch from now())::bigint::text,
    'venue_pos_integrations.webhook_secret');
  UPDATE public.venue_pos_integrations SET webhook_secret_id=_new_id, updated_at=now() WHERE venue_id=_venue_id;
  RETURN _new_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_pos_webhook_secret(_venue_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _val text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(), 'tabless_admin'::app_role) OR public.is_venue_manager(auth.uid(), _venue_id)) THEN
    RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT webhook_secret_id INTO _sid FROM public.venue_pos_integrations WHERE venue_id = _venue_id;
  IF _sid IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO _val FROM vault.decrypted_secrets WHERE id = _sid;
  RETURN _val;
END $$;

REVOKE ALL ON FUNCTION public.set_payment_secret(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payment_secret(uuid,text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_pos_webhook_secret(uuid,text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pos_webhook_secret(uuid)       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payment_secret(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_secret(uuid,text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_pos_webhook_secret(uuid,text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pos_webhook_secret(uuid)       TO authenticated, service_role;

-- Backfill: payment fields, one field at a time
DO $$
DECLARE r record; _new_id uuid;
BEGIN
  FOR r IN SELECT id, venue_id, api_key_test FROM public.venue_payment_config
           WHERE api_key_test IS NOT NULL AND length(trim(api_key_test))>0 AND api_key_test_secret_id IS NULL LOOP
    _new_id := vault.create_secret(r.api_key_test, 'payment:'||r.venue_id::text||':api_key_test:bf:'||r.id::text, 'backfill');
    UPDATE public.venue_payment_config SET api_key_test_secret_id=_new_id WHERE id=r.id;
  END LOOP;
  FOR r IN SELECT id, venue_id, api_key_live FROM public.venue_payment_config
           WHERE api_key_live IS NOT NULL AND length(trim(api_key_live))>0 AND api_key_live_secret_id IS NULL LOOP
    _new_id := vault.create_secret(r.api_key_live, 'payment:'||r.venue_id::text||':api_key_live:bf:'||r.id::text, 'backfill');
    UPDATE public.venue_payment_config SET api_key_live_secret_id=_new_id WHERE id=r.id;
  END LOOP;
  FOR r IN SELECT id, venue_id, client_key_test FROM public.venue_payment_config
           WHERE client_key_test IS NOT NULL AND length(trim(client_key_test))>0 AND client_key_test_secret_id IS NULL LOOP
    _new_id := vault.create_secret(r.client_key_test, 'payment:'||r.venue_id::text||':client_key_test:bf:'||r.id::text, 'backfill');
    UPDATE public.venue_payment_config SET client_key_test_secret_id=_new_id WHERE id=r.id;
  END LOOP;
  FOR r IN SELECT id, venue_id, client_key_live FROM public.venue_payment_config
           WHERE client_key_live IS NOT NULL AND length(trim(client_key_live))>0 AND client_key_live_secret_id IS NULL LOOP
    _new_id := vault.create_secret(r.client_key_live, 'payment:'||r.venue_id::text||':client_key_live:bf:'||r.id::text, 'backfill');
    UPDATE public.venue_payment_config SET client_key_live_secret_id=_new_id WHERE id=r.id;
  END LOOP;
  FOR r IN SELECT id, venue_id, hmac_key FROM public.venue_payment_config
           WHERE hmac_key IS NOT NULL AND length(trim(hmac_key))>0 AND hmac_key_secret_id IS NULL LOOP
    _new_id := vault.create_secret(r.hmac_key, 'payment:'||r.venue_id::text||':hmac_key:bf:'||r.id::text, 'backfill');
    UPDATE public.venue_payment_config SET hmac_key_secret_id=_new_id WHERE id=r.id;
  END LOOP;

  FOR r IN SELECT id, venue_id, webhook_secret FROM public.venue_pos_integrations
           WHERE webhook_secret IS NOT NULL AND length(trim(webhook_secret))>0 AND webhook_secret_id IS NULL LOOP
    _new_id := vault.create_secret(r.webhook_secret, 'pos_webhook:'||r.venue_id::text||':bf:'||r.id::text, 'backfill');
    UPDATE public.venue_pos_integrations SET webhook_secret_id=_new_id WHERE id=r.id;
  END LOOP;
END $$;

COMMENT ON COLUMN public.venue_payment_config.api_key_test    IS 'DEPRECATED — use api_key_test_secret_id (Vault).';
COMMENT ON COLUMN public.venue_payment_config.api_key_live    IS 'DEPRECATED — use api_key_live_secret_id (Vault).';
COMMENT ON COLUMN public.venue_payment_config.client_key_test IS 'DEPRECATED — use client_key_test_secret_id (Vault).';
COMMENT ON COLUMN public.venue_payment_config.client_key_live IS 'DEPRECATED — use client_key_live_secret_id (Vault).';
COMMENT ON COLUMN public.venue_payment_config.hmac_key        IS 'DEPRECATED — use hmac_key_secret_id (Vault).';
COMMENT ON COLUMN public.venue_pos_integrations.webhook_secret IS 'DEPRECATED — use webhook_secret_id (Vault).';
