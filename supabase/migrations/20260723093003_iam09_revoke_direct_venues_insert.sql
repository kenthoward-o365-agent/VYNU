-- IAM-09: Remove the ability for ANY authenticated user to INSERT arbitrary
-- venues.
--
-- The original base migration created "Owners can insert venues" WITH CHECK
-- (true). By the time of this fix, however, that policy had already been
-- renamed/replaced by later migrations:
--   * 20260407140822 → dropped "Owners can insert venues", created
--     "Authenticated users can create venues" WITH CHECK (auth.uid() IS NOT NULL)
--   * 20260708121627 → recreated "Authenticated users can create venues" with
--     WITH CHECK (auth.uid() IS NOT NULL AND (group_id IS NULL OR
--     is_group_admin(...) OR has_role(...,'tabless_admin')))
-- The effective, still-live policy is therefore "Authenticated users can
-- create venues", which lets ANY authenticated user insert a venue whose
-- group_id IS NULL. We must drop THAT policy (dropping only the long-gone
-- "Owners can insert venues" name is a no-op and leaves the hole open).
--
-- Legitimate creation paths after this change:
--   * Non-admin self-onboarding → create_venue_with_owner() (SECURITY DEFINER,
--     bypasses RLS and attaches the creator as owner) — src/pages/Onboarding.tsx.
--   * Platform admins → direct insert from the Admin Venues page (admin-gated),
--     covered by the admin-only INSERT policy below — src/pages/AdminVenues.tsx.
--
-- We intentionally keep the table-level INSERT grant (revoking it would also
-- block admins, since a GRANT is required in addition to a permissive RLS
-- policy) and rely on RLS to restrict who may insert.

DROP POLICY IF EXISTS "Owners can insert venues" ON public.venues;
DROP POLICY IF EXISTS "Authenticated users can create venues" ON public.venues;

DROP POLICY IF EXISTS "Admins can insert venues" ON public.venues;
CREATE POLICY "Admins can insert venues"
ON public.venues
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
