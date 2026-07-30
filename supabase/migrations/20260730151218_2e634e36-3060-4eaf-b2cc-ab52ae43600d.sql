-- 1) Per-zone tab rules
CREATE TABLE public.venue_tab_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  zone text NOT NULL,
  tabs_enabled boolean NOT NULL DEFAULT false,
  require_preauth boolean NOT NULL DEFAULT false,
  preauth_amount numeric(10,2) NOT NULL DEFAULT 50,
  max_tab_amount numeric(10,2),
  allow_split_payments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, zone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_tab_zones TO authenticated;
GRANT SELECT ON public.venue_tab_zones TO anon;
GRANT ALL ON public.venue_tab_zones TO service_role;
ALTER TABLE public.venue_tab_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tab_zones_public_read" ON public.venue_tab_zones FOR SELECT USING (true);
CREATE POLICY "tab_zones_manager_write" ON public.venue_tab_zones FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));
CREATE TRIGGER trg_venue_tab_zones_updated_at BEFORE UPDATE ON public.venue_tab_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Open tabs
CREATE TABLE public.table_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
  zone text,
  status text NOT NULL DEFAULT 'open',
  opened_by_diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  label text,
  preauth_required boolean NOT NULL DEFAULT false,
  preauth_amount numeric(10,2),
  preauth_psp_reference text,
  preauth_status text NOT NULL DEFAULT 'none',
  max_tab_amount numeric(10,2),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_tabs_status_check CHECK (status IN ('open','closing','settled','void')),
  CONSTRAINT table_tabs_preauth_status_check CHECK (preauth_status IN ('none','authorised','captured','released','failed'))
);
CREATE INDEX idx_table_tabs_venue_open ON public.table_tabs (venue_id, status);
CREATE INDEX idx_table_tabs_table ON public.table_tabs (table_id) WHERE status = 'open';
GRANT SELECT, INSERT, UPDATE ON public.table_tabs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.table_tabs TO anon;
GRANT ALL ON public.table_tabs TO service_role;
ALTER TABLE public.table_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tabs_staff_read" ON public.table_tabs FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "tabs_staff_write" ON public.table_tabs FOR UPDATE TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "tabs_diner_read_open" ON public.table_tabs FOR SELECT
  USING (status IN ('open','closing'));
CREATE POLICY "tabs_diner_open" ON public.table_tabs FOR INSERT
  WITH CHECK (
    status = 'open'
    AND EXISTS (SELECT 1 FROM public.tables t WHERE t.id = table_id AND t.venue_id = venue_id)
  );
CREATE TRIGGER trg_table_tabs_updated_at BEFORE UPDATE ON public.table_tabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Split / mixed payments against a tab
CREATE TABLE public.tab_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.table_tabs(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  tip_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  psp_reference text,
  reference_label text,
  payer_diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  payer_label text,
  is_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tab_payments_method_check CHECK (method IN ('card','apple_pay','google_pay','gift_card','voucher','cash','loyalty_points','other')),
  CONSTRAINT tab_payments_status_check CHECK (status IN ('pending','authorised','paid','failed','refunded','voided')),
  CONSTRAINT tab_payments_amount_check CHECK (amount >= 0 AND tip_amount >= 0)
);
CREATE INDEX idx_tab_payments_tab ON public.tab_payments (tab_id);
GRANT SELECT, INSERT, UPDATE ON public.tab_payments TO authenticated;
GRANT SELECT, INSERT ON public.tab_payments TO anon;
GRANT ALL ON public.tab_payments TO service_role;
ALTER TABLE public.tab_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tab_payments_staff_read" ON public.tab_payments FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "tab_payments_staff_write" ON public.tab_payments FOR ALL TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "tab_payments_diner_read" ON public.tab_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.table_tabs t WHERE t.id = tab_id AND t.status IN ('open','closing')));
CREATE POLICY "tab_payments_diner_insert" ON public.tab_payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.table_tabs t WHERE t.id = tab_id AND t.venue_id = venue_id AND t.status IN ('open','closing')));
CREATE TRIGGER trg_tab_payments_updated_at BEFORE UPDATE ON public.tab_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Orders join a tab
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tab_id uuid REFERENCES public.table_tabs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid';
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('paid','unpaid','refunded','void'));
CREATE INDEX IF NOT EXISTS idx_orders_tab ON public.orders (tab_id) WHERE tab_id IS NOT NULL;

-- 5) Tab summary for diners + staff (bypasses per-order RLS, scoped to one tab)
CREATE OR REPLACE FUNCTION public.get_tab_summary(_tab_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tab public.table_tabs%ROWTYPE;
  _orders jsonb;
  _payments jsonb;
  _ordered numeric := 0;
  _paid numeric := 0;
BEGIN
  SELECT * INTO _tab FROM public.table_tabs WHERE id = _tab_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'total', o.total, 'gratuity_amount', o.gratuity_amount,
           'status', o.status, 'payment_status', o.payment_status, 'created_at', o.created_at
         ) ORDER BY o.created_at), '[]'::jsonb),
         COALESCE(SUM(o.total), 0)
    INTO _orders, _ordered
    FROM public.orders o
   WHERE o.tab_id = _tab_id AND o.payment_status <> 'void';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'method', p.method, 'amount', p.amount, 'tip_amount', p.tip_amount,
           'status', p.status, 'payer_label', p.payer_label, 'reference_label', p.reference_label,
           'created_at', p.created_at
         ) ORDER BY p.created_at), '[]'::jsonb),
         COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('paid','authorised')), 0)
    INTO _payments, _paid
    FROM public.tab_payments p
   WHERE p.tab_id = _tab_id;

  RETURN jsonb_build_object(
    'tab', to_jsonb(_tab),
    'orders', _orders,
    'payments', _payments,
    'total_ordered', _ordered,
    'total_paid', _paid,
    'balance_due', GREATEST(_ordered - _paid, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_tab_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tab_summary(uuid) TO anon, authenticated, service_role;

-- 6) Settle a tab once fully paid
CREATE OR REPLACE FUNCTION public.settle_tab(_tab_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _summary jsonb;
  _balance numeric;
BEGIN
  _summary := public.get_tab_summary(_tab_id);
  IF _summary IS NULL THEN RAISE EXCEPTION 'Tab not found'; END IF;
  _balance := (_summary->>'balance_due')::numeric;
  IF _balance > 0.009 THEN
    RETURN jsonb_build_object('settled', false, 'balance_due', _balance);
  END IF;

  UPDATE public.orders SET payment_status = 'paid', status = 'paid'
   WHERE tab_id = _tab_id AND payment_status = 'unpaid';
  UPDATE public.table_tabs
     SET status = 'settled', closed_at = now(),
         preauth_status = CASE WHEN preauth_status = 'authorised' THEN 'released' ELSE preauth_status END
   WHERE id = _tab_id;

  RETURN jsonb_build_object('settled', true, 'balance_due', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.settle_tab(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_tab(uuid) TO anon, authenticated, service_role;

-- 7) Find or open the current tab for a table
CREATE OR REPLACE FUNCTION public.find_or_open_tab(
  _venue_id uuid,
  _table_id uuid,
  _session_id uuid DEFAULT NULL,
  _diner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tab_id uuid;
  _zone text;
  _rules public.venue_tab_zones%ROWTYPE;
BEGIN
  SELECT zone INTO _zone FROM public.tables WHERE id = _table_id AND venue_id = _venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found for venue'; END IF;

  SELECT * INTO _rules FROM public.venue_tab_zones
   WHERE venue_id = _venue_id AND zone IS NOT DISTINCT FROM _zone;
  IF NOT FOUND OR NOT _rules.tabs_enabled THEN
    RAISE EXCEPTION 'Tabs are not enabled for this area';
  END IF;

  SELECT id INTO _tab_id FROM public.table_tabs
   WHERE table_id = _table_id AND venue_id = _venue_id AND status = 'open'
   ORDER BY created_at DESC LIMIT 1;
  IF _tab_id IS NOT NULL THEN RETURN _tab_id; END IF;

  INSERT INTO public.table_tabs (
    venue_id, table_id, session_id, zone, opened_by_diner_id,
    preauth_required, preauth_amount, max_tab_amount
  ) VALUES (
    _venue_id, _table_id, _session_id, _zone, _diner_id,
    _rules.require_preauth, _rules.preauth_amount, _rules.max_tab_amount
  ) RETURNING id INTO _tab_id;

  RETURN _tab_id;
END;
$$;
REVOKE ALL ON FUNCTION public.find_or_open_tab(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_open_tab(uuid, uuid, uuid, uuid) TO anon, authenticated, service_role;