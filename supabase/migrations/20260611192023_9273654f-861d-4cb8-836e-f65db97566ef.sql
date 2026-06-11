
-- 1. display_terminals: hide device_token from regular staff via column-level grants
REVOKE SELECT ON public.display_terminals FROM authenticated;
GRANT SELECT (
  id, venue_id, name, pairing_code, pairing_code_expires_at,
  paired_at, paired_by, last_seen_at, user_agent,
  is_active, created_at, updated_at
) ON public.display_terminals TO authenticated;
-- service_role retains full SELECT (including device_token) via existing GRANT ALL
GRANT ALL ON public.display_terminals TO service_role;

-- 2. crm_suppression: restrict global (venue_id IS NULL) rows to admins only
DROP POLICY IF EXISTS "Staff view suppression for their venue" ON public.crm_suppression;
CREATE POLICY "Staff view suppression for their venue"
ON public.crm_suppression
FOR SELECT
TO authenticated
USING (
  venue_id IS NOT NULL
  AND public.is_venue_staff(auth.uid(), venue_id)
);
-- Global suppression rows remain readable only via the existing "Admins view all suppression" policy.

-- 3. diner_web_sessions: allow anon to read back their own anonymous sessions
CREATE POLICY "Anon can read own anonymous session"
ON public.diner_web_sessions
FOR SELECT
TO anon
USING (diner_id IS NULL AND ended_at IS NULL);
