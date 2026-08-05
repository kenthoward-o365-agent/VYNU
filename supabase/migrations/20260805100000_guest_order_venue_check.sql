-- Guest QR orders fail with 42501 "new row violates row-level security policy
-- for table orders".
--
-- Root cause: the orders INSERT policy proves the venue is live with an inline
-- subquery over public.venues:
--
--   AND EXISTS (SELECT 1 FROM public.venues v
--               WHERE v.id = orders.venue_id AND COALESCE(v.is_active, true) = true)
--
-- A policy expression is evaluated with the *caller's* privileges. On 12 June
-- (20260612163506, "remove anon read path on public.venues") the anon SELECT
-- policy was dropped and the grant revoked, so for a guest that subquery can
-- never see a row. The clause is ANDed above the customer_id branches, so it
-- fails first and the whole WITH CHECK fails, whatever customer_id holds.
--
-- That is why the 4 August rewrite of the customer_id branches did not help:
-- those branches were never the blocker.
--
-- Fix: move the venue check behind a SECURITY DEFINER helper so it no longer
-- depends on the caller being able to read public.venues. This keeps the June
-- decision intact — guests still cannot select venue rows. They can only learn
-- yes/no about a venue id they already hold, because it is in the QR URL they
-- scanned. Same pattern already used by is_venue_staff, is_venue_manager,
-- is_group_member, is_active_table_session and is_guest_diner_profile.

CREATE OR REPLACE FUNCTION public.is_active_venue(_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.venues v
     WHERE v.id = _venue_id
       AND COALESCE(v.is_active, true) = true
  )
$$;

COMMENT ON FUNCTION public.is_active_venue(uuid) IS
  'True when the venue exists and is active. SECURITY DEFINER so RLS policies can prove a venue is live without granting the caller read access to public.venues. Returns a boolean only — no venue data is exposed.';

REVOKE ALL ON FUNCTION public.is_active_venue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_venue(uuid) TO anon, authenticated, service_role;

-- Rebuild the policy. Two changes only:
--
--  1. The inline EXISTS over public.venues becomes is_active_venue(venue_id).
--
--  2. The guest branch drops "OR public.is_guest_diner_profile(customer_id)".
--     orders.customer_id is declared REFERENCES auth.users(id), and a guest
--     diner profile (user_id IS NULL) has no auth.users row, so that branch
--     could never be satisfied — the foreign key rejects the value before RLS
--     is consulted. Leaving it in invites the next person to "fix" guest
--     attribution by sending dinerId as customer_id, which fails with 23503
--     rather than a permissions error. If guest attribution is wanted later it
--     needs a schema change, not a policy change.
--
-- Everything else is carried over unchanged.

DROP POLICY IF EXISTS "Anyone can create orders for live venues" ON public.orders;

CREATE POLICY "Anyone can create orders for live venues"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (
  venue_id IS NOT NULL
  AND public.is_active_venue(venue_id)
  AND (
    -- Guest: no identity claimed.
    (auth.uid() IS NULL AND customer_id IS NULL)
    -- Signed in: may only claim themselves.
    OR (auth.uid() IS NOT NULL AND (
          customer_id IS NULL
          OR customer_id = auth.uid()
          OR customer_id = public.get_user_diner_profile_id()
       ))
    -- Staff ordering on a diner's behalf.
    OR public.is_venue_staff(auth.uid(), venue_id)
    OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
  )
);
