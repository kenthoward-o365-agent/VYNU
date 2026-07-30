-- 1. Remove public read exposure on tab_payments and table_tabs.
DROP POLICY IF EXISTS tab_payments_diner_read ON public.tab_payments;
DROP POLICY IF EXISTS tabs_diner_read_open ON public.table_tabs;

-- 2. Fix tautological venue checks on insert policies.
DROP POLICY IF EXISTS tabs_diner_open ON public.table_tabs;
CREATE POLICY tabs_diner_open ON public.table_tabs
  FOR INSERT
  WITH CHECK (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.tables t
      WHERE t.id = table_tabs.table_id
        AND t.venue_id = table_tabs.venue_id
    )
  );

DROP POLICY IF EXISTS tab_payments_diner_insert ON public.tab_payments;
CREATE POLICY tab_payments_diner_insert ON public.tab_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.table_tabs t
      WHERE t.id = tab_payments.tab_id
        AND t.venue_id = tab_payments.venue_id
        AND t.status = ANY (ARRAY['open','closing'])
    )
  );

-- 3. Staff-only tab functions must not be callable anonymously.
REVOKE EXECUTE ON FUNCTION public.list_open_tabs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_tab(uuid) FROM anon;