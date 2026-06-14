
-- 1. Add a secret_id reference column
ALTER TABLE public.api_webhooks
  ADD COLUMN IF NOT EXISTS secret_id uuid;

-- 2. Migrate any existing plaintext secrets into Vault
DO $$
DECLARE
  r RECORD;
  _sid uuid;
BEGIN
  FOR r IN SELECT id, secret FROM public.api_webhooks WHERE secret_id IS NULL AND secret IS NOT NULL LOOP
    _sid := vault.create_secret(
      r.secret,
      'api_webhook:'||r.id::text||':'||extract(epoch from now())::bigint::text,
      'api_webhooks.secret'
    );
    UPDATE public.api_webhooks SET secret_id = _sid WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Drop NOT NULL on the plaintext column and clear it
ALTER TABLE public.api_webhooks ALTER COLUMN secret DROP NOT NULL;
UPDATE public.api_webhooks SET secret = NULL WHERE secret IS NOT NULL;

-- 4. Revoke column-level read on the plaintext secret column
REVOKE SELECT (secret) ON public.api_webhooks FROM anon, authenticated, PUBLIC;

-- 5. Reader helper — service role / SECURITY DEFINER access only
CREATE OR REPLACE FUNCTION public.get_api_webhook_secret(_webhook_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _sid uuid; _val text;
BEGIN
  -- Only admins or service role (auth.uid() IS NULL) may read.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT secret_id INTO _sid FROM public.api_webhooks WHERE id = _webhook_id;
  IF _sid IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO _val FROM vault.decrypted_secrets WHERE id = _sid;
  RETURN _val;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_api_webhook_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_webhook_secret(uuid) TO service_role;

-- 6. Admin-callable creator — generates secret server-side, stores in Vault,
--    returns the plaintext exactly once for the caller to show in the UI.
CREATE OR REPLACE FUNCTION public.create_api_webhook(
  _partner_id uuid, _venue_id uuid, _url text, _events text[]
)
RETURNS TABLE(webhook_id uuid, secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _wid uuid; _secret text; _sid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _url IS NULL OR length(trim(_url)) = 0 THEN RAISE EXCEPTION 'url required'; END IF;
  IF _events IS NULL OR array_length(_events, 1) IS NULL THEN RAISE EXCEPTION 'events required'; END IF;

  _secret := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.api_webhooks (partner_id, venue_id, url, events, secret)
  VALUES (_partner_id, _venue_id, _url, _events, NULL)
  RETURNING id INTO _wid;

  _sid := vault.create_secret(
    _secret,
    'api_webhook:'||_wid::text||':'||extract(epoch from now())::bigint::text,
    'api_webhooks.secret'
  );
  UPDATE public.api_webhooks SET secret_id = _sid WHERE id = _wid;

  RETURN QUERY SELECT _wid, _secret;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_api_webhook(uuid, uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_webhook(uuid, uuid, text, text[]) TO authenticated;

-- 7. Update list_api_webhooks_safe to report secret presence via secret_id
CREATE OR REPLACE FUNCTION public.list_api_webhooks_safe()
RETURNS TABLE(id uuid, partner_id uuid, venue_id uuid, url text, events text[], is_active boolean, last_delivery_at timestamp with time zone, last_delivery_status text, created_at timestamp with time zone, updated_at timestamp with time zone, has_secret boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, partner_id, venue_id, url, events, is_active,
         last_delivery_at, last_delivery_status, created_at, updated_at,
         (secret_id IS NOT NULL)
  FROM public.api_webhooks
  WHERE public.has_role(auth.uid(), 'tabless_admin'::app_role)
  ORDER BY created_at DESC;
$$;
