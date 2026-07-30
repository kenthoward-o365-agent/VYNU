CREATE OR REPLACE FUNCTION public.get_table_tab_rules(_venue_id uuid, _table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zone text;
  _rules public.venue_tab_zones%ROWTYPE;
  _open_tab uuid;
BEGIN
  SELECT zone INTO _zone FROM public.tables WHERE id = _table_id AND venue_id = _venue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tabs_enabled', false);
  END IF;

  SELECT * INTO _rules FROM public.venue_tab_zones
   WHERE venue_id = _venue_id AND zone IS NOT DISTINCT FROM _zone;

  SELECT id INTO _open_tab FROM public.table_tabs
   WHERE table_id = _table_id AND venue_id = _venue_id AND status = 'open'
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'zone', _zone,
    'tabs_enabled', COALESCE(_rules.tabs_enabled, false),
    'require_preauth', COALESCE(_rules.require_preauth, false),
    'preauth_amount', _rules.preauth_amount,
    'max_tab_amount', _rules.max_tab_amount,
    'allow_split_payments', COALESCE(_rules.allow_split_payments, true),
    'open_tab_id', _open_tab
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_table_tab_rules(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_tab_rules(uuid, uuid) TO anon, authenticated, service_role;

-- Staff overview of open tabs with running balances
CREATE OR REPLACE FUNCTION public.list_open_tabs(_venue_id uuid)
RETURNS TABLE (
  tab_id uuid,
  table_number text,
  zone text,
  status text,
  label text,
  preauth_status text,
  opened_at timestamptz,
  total_ordered numeric,
  total_paid numeric,
  balance_due numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id,
         tb.table_number,
         t.zone,
         t.status,
         t.label,
         t.preauth_status,
         t.created_at,
         COALESCE(o.ordered, 0),
         COALESCE(p.paid, 0),
         GREATEST(COALESCE(o.ordered, 0) - COALESCE(p.paid, 0), 0)
    FROM public.table_tabs t
    LEFT JOIN public.tables tb ON tb.id = t.table_id
    LEFT JOIN LATERAL (
      SELECT SUM(total) AS ordered FROM public.orders
       WHERE tab_id = t.id AND payment_status <> 'void'
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS paid FROM public.tab_payments
       WHERE tab_id = t.id AND status IN ('paid','authorised')
    ) p ON true
   WHERE t.venue_id = _venue_id
     AND t.status IN ('open','closing')
     AND public.is_venue_staff(auth.uid(), _venue_id)
   ORDER BY t.created_at;
$$;
REVOKE ALL ON FUNCTION public.list_open_tabs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_tabs(uuid) TO authenticated, service_role;