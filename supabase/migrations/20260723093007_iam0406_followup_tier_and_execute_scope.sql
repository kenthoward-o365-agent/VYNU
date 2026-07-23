-- Follow-ups to IAM-04 and IAM-06 (from PR code review).
--
-- These changes are in a NEW migration rather than edited into the original
-- iam04/iam06 files, because those originals were already applied. Migrations
-- run once by filename; editing an applied migration causes a migration-history
-- mismatch on the next deploy and does not re-run on databases that already
-- have the original.

-- IAM-04 follow-up: the diner self-enrollment policy capped `balance` at 0 but
-- left `tier` client-settable. `tier` also drives rewards/benefits, so a diner
-- could self-assign a premium tier. Recreate the policy to also require
-- `tier IS NULL`. Server-authoritative crediting/tiering still happens through
-- enroll_diner_in_loyalty() (SECURITY DEFINER, bypasses RLS) or staff paths.
DROP POLICY IF EXISTS "Diners can enrol themselves" ON public.loyalty_balances;
CREATE POLICY "Diners can enrol themselves"
ON public.loyalty_balances
FOR INSERT
TO authenticated
WITH CHECK (
  diner_id = public.get_user_diner_profile_id()
  AND balance = 0
  AND tier IS NULL
);

-- IAM-06 follow-up: new functions are granted EXECUTE to PUBLIC by default.
-- Revoke that so is_active_table_session is callable only by the roles we
-- explicitly granted (anon, authenticated).
REVOKE EXECUTE ON FUNCTION public.is_active_table_session(uuid) FROM PUBLIC;
