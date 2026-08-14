-- 1) PRIVILEGE_ESCALATION fix on venue_staff.
-- Recreate the "Managers can update staff" policy with a strict WITH CHECK that:
--   * Forces the post-update row to still belong to a venue the actor manages (blocks moving a row to another venue).
--   * Prevents changing the user_id or the venue_id of an existing row.
--   * Prevents a manager from promoting themselves or anyone to 'owner' (only existing owners or platform admins can do that).
DROP POLICY IF EXISTS "Managers can update staff" ON public.venue_staff;

CREATE POLICY "Managers can update staff"
ON public.venue_staff
FOR UPDATE
TO authenticated
USING (
  public.is_venue_manager(auth.uid(), venue_id)
)
WITH CHECK (
  public.is_venue_manager(auth.uid(), venue_id)
  AND venue_id   = (SELECT vs.venue_id FROM public.venue_staff vs WHERE vs.id = venue_staff.id)
  AND user_id    = (SELECT vs.user_id  FROM public.venue_staff vs WHERE vs.id = venue_staff.id)
  AND (
    role <> 'owner'
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.venue_staff vs2
      WHERE vs2.venue_id = venue_staff.venue_id
        AND vs2.user_id = auth.uid()
        AND vs2.role = 'owner'
        AND vs2.is_active = true
    )
  )
);

-- 2) EXPOSED_SENSITIVE_DATA fix on api_webhooks.secret.
-- Revoke column-level SELECT on the plaintext signing secret from app roles.
-- The existing safe accessor public.list_api_webhooks_safe() already returns a has_secret boolean
-- instead of the raw value, and edge functions running as service_role still have full access for signing.
REVOKE SELECT (secret) ON public.api_webhooks FROM PUBLIC;
REVOKE SELECT (secret) ON public.api_webhooks FROM anon;
REVOKE SELECT (secret) ON public.api_webhooks FROM authenticated;
-- service_role retains access (used by webhook-dispatch edge function for HMAC signing).
