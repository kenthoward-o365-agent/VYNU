-- Fix: set_payment_secret rejected service-role callers with "Not authorised".
--
-- The admin-set-payment-credentials edge function calls set_payment_secret through
-- its SERVICE-ROLE client (after it has already verified the caller is a
-- tabless_admin). In that context auth.uid() is NULL, so the original gate
--     IF NOT public.has_role(auth.uid(), 'tabless_admin') THEN RAISE 'Not authorised'
-- always failed (has_role(NULL, …) is false), and no payment secret could ever be
-- written to Vault.
--
-- Its sibling get_payment_secret already guards with `auth.uid() IS NOT NULL AND …`
-- so service-role/definer calls pass while a non-admin JWT is still rejected. This
-- migration brings set_payment_secret in line with that pattern.
--
-- Safe because: the function is REVOKEd from PUBLIC/anon and granted only to
-- authenticated + service_role, so a NULL auth.uid() can only originate from a
-- trusted service-role caller — a non-admin authenticated user has a non-NULL
-- auth.uid() and is still rejected.

CREATE OR REPLACE FUNCTION public.set_payment_secret(_venue_id uuid, _field text, _value text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _col text := public._payment_secret_column(_field); _existing uuid; _new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
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

-- Re-assert the grants (idempotent) so anon can never reach the null-bypass path.
REVOKE ALL ON FUNCTION public.set_payment_secret(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payment_secret(uuid,text,text) TO authenticated, service_role;
