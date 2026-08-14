-- IAM-19: Audit trail for platform-admin (user_roles) grants/revocations.
--
-- tabless_admin is a row in public.user_roles. There was no record of who
-- granted/revoked admin and when. This adds an append-only audit table and a
-- trigger that records every INSERT/DELETE, attributing it to auth.uid().
-- (Bootstrap of the first admin remains an out-of-band/service-role action —
-- documented in IDENTITY_ACCESS_SECURITY_PLAN.md §7.)

CREATE TABLE IF NOT EXISTS public.user_roles_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  target_user_id uuid,
  role text,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles_audit ENABLE ROW LEVEL SECURITY;

-- Only platform admins may read the audit log. No INSERT/UPDATE/DELETE policy
-- exists, so it is append-only via the SECURITY DEFINER trigger below and
-- otherwise immutable through the API.
DROP POLICY IF EXISTS "Admins can view role audit" ON public.user_roles_audit;
CREATE POLICY "Admins can view role audit"
ON public.user_roles_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_roles_audit (action, target_user_id, role, performed_by)
    VALUES ('grant', NEW.user_id, NEW.role::text, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_roles_audit (action, target_user_id, role, performed_by)
    VALUES ('revoke', OLD.user_id, OLD.role::text, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();
