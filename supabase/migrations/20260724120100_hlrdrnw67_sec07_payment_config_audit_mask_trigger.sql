-- HLRDRNW-67 · SEC-07 — DB-enforced masking on payment_config_audit.
--
-- old_value/new_value are documented as "masked / redacted", but masking was only
-- ever performed by the application before insert; the database did not enforce it.
-- A single writer that forgets to mask (e.g. a new secret field added to
-- admin-set-payment-credentials) would persist a raw credential into a table that
-- venue managers and admins can read. This trigger makes masking a DB guarantee:
-- for known secret fields, only the last 4 chars are ever stored; other fields are
-- length-bounded as a defence against oversized values. It coerces rather than
-- rejects, so the audit event is never lost (PCI Req 10).

-- Mask a secret value to at most its last 4 characters.
CREATE OR REPLACE FUNCTION public._mask_secret_value(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _v IS NULL THEN NULL
    WHEN length(_v) = 0 THEN _v
    WHEN length(_v) <= 4 THEN '••••'
    ELSE '••••' || right(_v, 4)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_payment_config_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _secret_fields text[] := ARRAY[
    'api_key_test','api_key_live','client_key_test','client_key_live',
    'hmac_key','webhook_secret','secret','client_secret','service_account_token'
  ];
BEGIN
  IF NEW.field = ANY(_secret_fields) THEN
    -- Force-mask secret fields regardless of what the writer supplied.
    NEW.old_value := public._mask_secret_value(NEW.old_value);
    NEW.new_value := public._mask_secret_value(NEW.new_value);
  ELSE
    -- Non-secret fields keep their value but are length-bounded.
    IF NEW.old_value IS NOT NULL AND length(NEW.old_value) > 256 THEN
      NEW.old_value := left(NEW.old_value, 256);
    END IF;
    IF NEW.new_value IS NOT NULL AND length(NEW.new_value) > 256 THEN
      NEW.new_value := left(NEW.new_value, 256);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mask_payment_config_audit ON public.payment_config_audit;
CREATE TRIGGER trg_mask_payment_config_audit
  BEFORE INSERT OR UPDATE ON public.payment_config_audit
  FOR EACH ROW EXECUTE FUNCTION public.mask_payment_config_audit();
