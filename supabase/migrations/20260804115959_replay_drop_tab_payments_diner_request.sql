-- Drop tab_payments_diner_request so the next migration can create it.
--
-- WHY THIS EXISTS
-- Two migrations create this policy:
--
--   20260804082349_e7059ee1-...sql   DROP IF EXISTS, then CREATE   (Lovable)
--   20260804120000_tab_payment_server_authoritative.sql  CREATE only  (hand-authored)
--
-- Replayed in filename order the first one creates the policy and the second
-- fails with 42710 "policy ... already exists". Same root cause as the
-- enroll_diner_in_loyalty collision: a hand-authored migration whose timestamp
-- does not reflect when it was really applied to the original database.
--
-- The two policy bodies are byte-for-byte identical — same FOR INSERT, same
-- TO anon, authenticated, same WITH CHECK — so it makes no difference which one
-- wins. The end state is the same either way, which is what makes this drop
-- safe rather than a judgement call about intent.

DROP POLICY IF EXISTS tab_payments_diner_request ON public.tab_payments;
