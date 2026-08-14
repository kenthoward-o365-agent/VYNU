-- HLRDRNW-67 · SEC-01 — Restrict get_pos_webhook_secret to admin/service_role only.
--
-- Previously the authorisation gate allowed `is_venue_manager(auth.uid(), _venue_id)`, so any
-- venue MANAGER could retrieve their venue's decrypted POS webhook signing secret in cleartext via
-- rpc('get_pos_webhook_secret', ...). That secret is used to VERIFY inbound POS webhooks, so a
-- manager (a lower-trust role than a platform admin) could exfiltrate it and forge POS webhooks for
-- their own venue.
--
-- The only legitimate caller is the service-role `pos-order-webhook` edge function (auth.uid() IS
-- NULL there). This aligns the gate with the sibling reader `get_payment_secret` (admin +
-- service_role only). Venue managers are now denied; nothing else changes.

CREATE OR REPLACE FUNCTION public.get_pos_webhook_secret(_venue_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _val text;
BEGIN
  -- Admin or service_role only. A user JWT that is not a tabless_admin is rejected;
  -- service_role calls (auth.uid() IS NULL) pass, exactly like get_payment_secret.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT webhook_secret_id INTO _sid FROM public.venue_pos_integrations WHERE venue_id = _venue_id;
  IF _sid IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO _val FROM vault.decrypted_secrets WHERE id = _sid;
  RETURN _val;
END $$;

-- Grants unchanged (the internal gate is authoritative); re-assert for clarity.
REVOKE ALL ON FUNCTION public.get_pos_webhook_secret(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pos_webhook_secret(uuid) TO authenticated, service_role;
