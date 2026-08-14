-- Tab payments must be server-authoritative.
--
-- Previously any diner could INSERT a row into tab_payments with an arbitrary
-- amount and status='paid'. get_tab_summary counts payments with
-- status IN ('paid','authorised') toward balance_due, so a fabricated row drove
-- balance_due to zero and settle_tab() then marked every order on the tab paid
-- and closed it. No money had moved.
--
-- This is the same class of issue that IVA-01 closed for order pricing
-- (enforce_order_item_pricing / recompute_order_total). Tabs shipped after that
-- work and never received the equivalent protection.
--
-- After this migration a payment that counts toward the balance can only be
-- written by:
--   * the service role (adyen-payment, after the PSP actually authorised), or
--   * venue staff (cash / manual settlement at the bar).
--
-- Diners keep exactly one write path: lodging a gift card or voucher as
-- status='pending', which does NOT count toward balance_due and still has to be
-- confirmed by staff before it does.

-- ── 1. Replace the permissive diner INSERT policy ────────────────────────────

DROP POLICY IF EXISTS tab_payments_diner_insert ON public.tab_payments;

-- Diners may only lodge a gift card / voucher for staff to confirm.
-- status is pinned to 'pending' so this can never affect balance_due.
CREATE POLICY tab_payments_diner_request ON public.tab_payments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND method = ANY (ARRAY['gift_card','voucher'])
    AND EXISTS (
      SELECT 1 FROM public.table_tabs t
      WHERE t.id = tab_payments.tab_id
        AND t.venue_id = tab_payments.venue_id
        AND t.status = ANY (ARRAY['open','closing'])
    )
  );

-- Staff keep full write access for their own venue (cash, comps, confirming
-- a lodged voucher). tab_payments_staff_write already covers this FOR ALL;
-- it is left in place untouched.

-- ── 2. Defence in depth: a trigger the policies cannot be routed around ──────

-- RLS is the primary control, but a future policy change (or a function that
-- runs as a table owner) could reopen the hole. This trigger fails closed:
-- unless the writer is the service role or venue staff, the row may not claim
-- to be money.
-- SECURITY INVOKER on purpose: under SECURITY DEFINER, current_user resolves to
-- the function owner rather than the caller's role, which would make the
-- service_role check below always true. The function only reads NEW and calls
-- is_venue_staff (itself SECURITY DEFINER), so it needs no elevated rights.
CREATE OR REPLACE FUNCTION public.enforce_tab_payment_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  -- NULLIF guard: current_setting(..., true) yields '' when unset, and
  -- ''::jsonb raises instead of returning NULL.
  _claim_role text := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  _uid  uuid := auth.uid();
BEGIN
  -- service_role writes come from our own edge functions after the PSP
  -- confirmed the charge. PostgREST SET ROLEs to service_role, so current_user
  -- is authoritative; the JWT claim is a belt-and-braces fallback.
  IF current_user = 'service_role' OR _claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Venue staff may record settlement taken at the bar.
  IF _uid IS NOT NULL AND public.is_venue_staff(_uid, NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  -- Everyone else may only lodge a pending gift card / voucher.
  IF NEW.status <> 'pending'
     OR NEW.method <> ALL (ARRAY['gift_card','voucher']) THEN
    RAISE EXCEPTION
      'tab_payments: only venue staff or the payment service may record a settled payment (attempted method=%, status=%)',
      NEW.method, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A lodged voucher must not carry a PSP reference; that would imply a real
  -- card capture that never happened.
  IF NEW.psp_reference IS NOT NULL THEN
    RAISE EXCEPTION 'tab_payments: psp_reference may only be set by the payment service'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tab_payment_authority ON public.tab_payments;
CREATE TRIGGER trg_enforce_tab_payment_authority
  BEFORE INSERT ON public.tab_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tab_payment_authority();

-- Same rule on UPDATE: a diner must not be able to promote their own lodged
-- voucher from 'pending' to 'paid'.
CREATE OR REPLACE FUNCTION public.enforce_tab_payment_update_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _claim_role text := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  _uid  uuid := auth.uid();
BEGIN
  IF current_user = 'service_role' OR _claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF _uid IS NOT NULL AND public.is_venue_staff(_uid, NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'tab_payments: only staff or the payment service may modify a payment'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tab_payment_update_authority ON public.tab_payments;
CREATE TRIGGER trg_enforce_tab_payment_update_authority
  BEFORE UPDATE ON public.tab_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tab_payment_update_authority();

-- ── 3. Make PSP de-duplication race-proof ────────────────────────────────────

-- adyen-payment previously guarded against double-crediting with a
-- SELECT-then-INSERT, which is not atomic: two concurrent Drop-in retries or a
-- 3DS replay could both pass the SELECT and insert two rows for one capture.
-- The database is the only place this can be enforced reliably.
--
-- A plain (not partial) unique index is deliberate: PostgreSQL treats NULLs as
-- distinct in a unique index, so rows without a psp_reference — staff cash,
-- lodged vouchers — are unaffected and can coexist freely. A partial index
-- would also work, but ON CONFLICT inference against one requires restating the
-- predicate, which PostgREST cannot express.
-- If the old racy path already double-credited a capture, the index below will
-- fail with a bare "could not create unique index". Surface it as something an
-- operator can act on instead, and name the rows that need reconciling.
DO $$
DECLARE
  _dupes text;
BEGIN
  SELECT string_agg(psp_reference || ' (' || n || ' rows)', ', ')
    INTO _dupes
    FROM (
      SELECT psp_reference, count(*) AS n
        FROM public.tab_payments
       WHERE psp_reference IS NOT NULL
       GROUP BY psp_reference
      HAVING count(*) > 1
    ) d;

  IF _dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'tab_payments already contains duplicate psp_reference values, so the same capture has been credited more than once: %. Reconcile these rows before applying this migration.',
      _dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tab_payments_psp_reference
  ON public.tab_payments (psp_reference);

-- ── 4. Tighten grants ────────────────────────────────────────────────────────

-- anon never needs UPDATE; authenticated diners are gated by the policies and
-- triggers above, and staff UPDATE flows through tab_payments_staff_write.
REVOKE UPDATE ON public.tab_payments FROM anon;

COMMENT ON TABLE public.tab_payments IS
  'Payments against an open tab. Rows that count toward balance_due (status paid/authorised) are written only by the service role after PSP confirmation, or by venue staff. Diners may only lodge pending gift card / voucher requests.';
