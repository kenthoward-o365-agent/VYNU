-- Restore anon EXECUTE on get_venue_audit_date.
--
-- 20260730232240 contains a bulk hardening block headed "admin/operator-only
-- functions: block anonymous callers, keep signed-in access", which loops over
-- a list and runs:
--
--   REVOKE ALL ON FUNCTION <sig> FROM anon, public;
--   GRANT EXECUTE ON FUNCTION <sig> TO authenticated, service_role;
--
-- get_venue_audit_date was included in that list, alongside genuinely
-- operator-only functions such as get_platform_financials, get_admin_dashboard
-- and get_venue_admin_detail. It does not belong there: the guest checkout
-- calls it on every order to stamp the venue's trading day
-- (CheckoutPanel.createOrderRow). A guest is not an operator, so the revoke
-- broke the guest path and returns 401.
--
-- Why this matters beyond the console noise: the client falls back to
--
--   new Date().toISOString().slice(0, 10)
--
-- which is the browser's local calendar date, not the venue's trading day.
-- Reporting filters revenue on orders.audit_date. For a venue trading past
-- midnight the business date is still the previous day, so guest orders placed
-- after midnight are stamped with the wrong trading day and end-of-day
-- reconciliation silently disagrees with the till.
--
-- The function is SECURITY DEFINER and returns a single date for a venue id the
-- caller already holds (it is in the QR URL they scanned). It exposes no
-- venue, order or customer data, so anon EXECUTE carries no meaningful risk.
--
-- Follow-up worth doing separately: orders.audit_date is a financial field and
-- the browser should not supply it at all. Stamping it from a BEFORE INSERT
-- trigger on public.orders would remove the need for this RPC on the guest path
-- entirely, in the same spirit as the IVA-01 server-side pricing work. Not done
-- here because it needs care around staff backdating orders.

GRANT EXECUTE ON FUNCTION public.get_venue_audit_date(uuid) TO anon;

COMMENT ON FUNCTION public.get_venue_audit_date(uuid) IS
  'Returns the venue''s current trading (audit) date, falling back to CURRENT_DATE when uninitialised. Called by the guest checkout to stamp orders.audit_date, so anon EXECUTE is required — do not include this in operator-only permission sweeps.';
