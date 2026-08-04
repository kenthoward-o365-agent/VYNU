-- Fix: saving an H&L Exceed credential failed with a 500 from
-- admin-set-pos-credentials ("An unexpected error occurred. Please try again."
-- plus a correlation id), so no POS integration could be connected.
--
-- Cause: 20260730232240_0d92b507-5500-4cf3-b45c-b603975e744f.sql ran a blanket
-- loop over a list of vault-writing functions that includes set_pos_credential:
--     REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public;
--     GRANT EXECUTE ON FUNCTION %s TO service_role;
-- That overrode 20260730130722, which had deliberately kept `authenticated`
-- (it revoked from PUBLIC, anon only). The edge function calls this RPC through a
-- client that carries the CALLER's JWT, so PostgREST executes it as
-- `authenticated` — which no longer holds EXECUTE. The call fails with
-- 42501 permission denied and the function's catch block sanitises it into the
-- generic 500. Production had not yet taken 20260730232240, which is why the same
-- flow still worked there.
--
-- Fix (mirrors 20260803134535_fix_set_payment_secret_service_role.sql, which
-- resolved the identical problem on the payment sibling): keep the function
-- service_role-only and relax the internal gate so a service-role caller — where
-- auth.uid() is NULL — passes, instead of re-widening EXECUTE to authenticated.
-- admin-set-pos-credentials is updated in the same change to call this RPC with
-- its service-role client.
--
-- Safe because: EXECUTE is granted to service_role only, so a NULL auth.uid() can
-- only originate from a trusted service-role caller, and that caller
-- (admin-set-pos-credentials) independently verifies the requester is a
-- tabless_admin or a manager of _venue_id before calling. The auth.uid()-based
-- check is retained as defence in depth in case the function is ever re-exposed
-- to authenticated callers.
--
-- NOTE ON ORDERING: this file is timestamped after 20260730232240 and must
-- converge on that migration's end state (service_role only) rather than
-- re-granting anon/authenticated. Do not add `GRANT ... TO authenticated` here.

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
  -- auth.uid() IS NULL => service-role caller (already authorised upstream).
  -- A non-NULL uid must still be a platform admin or a manager of this venue.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'tabless_admin'::app_role)
     AND NOT public.is_venue_manager(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _field IS NULL OR length(_field) = 0 THEN
    RAISE EXCEPTION 'field required';
  END IF;
  -- Never write an empty secret to Vault (parity with set_payment_secret).
  IF _value IS NULL OR length(trim(_value)) = 0 THEN
    RAISE EXCEPTION 'value required';
  END IF;

  _name := 'pos_' || _venue_id::text || '_' || _field;

  -- If a secret is already mapped, update it; else create a new one.
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

-- Re-assert the grants (idempotent), matching the end state established by
-- 20260730232240: service_role only. CREATE OR REPLACE above preserves existing
-- privileges, so this is belt-and-braces rather than a change in reachability.
REVOKE ALL ON FUNCTION public.set_pos_credential(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pos_credential(uuid, text, text) TO service_role;
