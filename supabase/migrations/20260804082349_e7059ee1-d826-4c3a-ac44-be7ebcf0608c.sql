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

REVOKE ALL ON FUNCTION public.set_payment_secret(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_payment_secret(uuid,text,text) TO service_role;

ALTER TABLE public.order_refunds
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_refunds_request_id
  ON public.order_refunds (request_id);

COMMENT ON COLUMN public.order_refunds.request_id IS
  'Stable client-generated idempotency id for a refund attempt; also used as the Adyen Idempotency-Key/reference so a retried refund is neither logged nor charged twice.';

CREATE OR REPLACE FUNCTION public.set_pos_credential(
  _venue_id uuid,
  _field text,
  _value text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _secret_id uuid;
  _existing uuid;
  _name text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'tabless_admin'::app_role)
     AND NOT public.is_venue_manager(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _field IS NULL OR length(_field) = 0 THEN
    RAISE EXCEPTION 'field required';
  END IF;
  IF _value IS NULL OR length(trim(_value)) = 0 THEN
    RAISE EXCEPTION 'value required';
  END IF;

  _name := 'pos_' || _venue_id::text || '_' || _field;

  SELECT (secrets_map ->> _field)::uuid INTO _existing
  FROM public.venue_pos_integrations WHERE venue_id = _venue_id;

  IF _existing IS NOT NULL THEN
    PERFORM vault.update_secret(_existing, _value, _name, NULL);
    _secret_id := _existing;
  ELSE
    SELECT vault.create_secret(_value, _name, 'POS credential for venue ' || _venue_id) INTO _secret_id;
  END IF;

  UPDATE public.venue_pos_integrations
  SET secrets_map = secrets_map || jsonb_build_object(_field, _secret_id::text),
      config = config - _field,
      updated_at = now()
  WHERE venue_id = _venue_id;

  RETURN _secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_pos_credential(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pos_credential(uuid, text, text) TO service_role;

DROP POLICY IF EXISTS tab_payments_diner_insert ON public.tab_payments;
DROP POLICY IF EXISTS tab_payments_diner_request ON public.tab_payments;

CREATE POLICY tab_payments_diner_request ON public.tab_payments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND method = ANY (ARRAY['gift_card','voucher'])
    AND EXISTS (
      SELECT 1 FROM public.table_tabs t
      WHERE t.id = tab_payments.tab_id
        AND t.venue_id = tab_payments.venue_id
        AND t.status = ANY (ARRAY['open','closing'])
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_tab_payment_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _claim_role text := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  _uid  uuid := auth.uid();
BEGIN
  IF current_user = 'service_role' OR _claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF _uid IS NOT NULL AND public.is_venue_staff(_uid, NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'pending'
     OR NEW.method <> ALL (ARRAY['gift_card','voucher']) THEN
    RAISE EXCEPTION
      'tab_payments: only venue staff or the payment service may record a settled payment (attempted method=%, status=%)',
      NEW.method, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.psp_reference IS NOT NULL THEN
    RAISE EXCEPTION 'tab_payments: psp_reference may only be set by the payment service'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tab_payment_authority ON public.tab_payments;
CREATE TRIGGER trg_enforce_tab_payment_authority
  BEFORE INSERT ON public.tab_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tab_payment_authority();

CREATE OR REPLACE FUNCTION public.enforce_tab_payment_update_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _claim_role text := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  _uid  uuid := auth.uid();
BEGIN
  IF current_user = 'service_role' OR _claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF _uid IS NOT NULL AND public.is_venue_staff(_uid, NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'tab_payments: only staff or the payment service may modify a payment'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tab_payment_update_authority ON public.tab_payments;
CREATE TRIGGER trg_enforce_tab_payment_update_authority
  BEFORE UPDATE ON public.tab_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tab_payment_update_authority();

DO $$
DECLARE
  _dupes text;
BEGIN
  SELECT string_agg(psp_reference || ' (' || n || ' rows)', ', ')
    INTO _dupes
    FROM (
      SELECT psp_reference, count(*) AS n
        FROM public.tab_payments
       WHERE psp_reference IS NOT NULL
       GROUP BY psp_reference
      HAVING count(*) > 1
    ) d;

  IF _dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'tab_payments already contains duplicate psp_reference values, so the same capture has been credited more than once: %. Reconcile these rows before applying this migration.',
      _dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tab_payments_psp_reference
  ON public.tab_payments (psp_reference);

REVOKE UPDATE ON public.tab_payments FROM anon;

COMMENT ON TABLE public.tab_payments IS
  'Payments against an open tab. Rows that count toward balance_due (status paid/authorised) are written only by the service role after PSP confirmation, or by venue staff. Diners may only lodge pending gift card / voucher requests.';