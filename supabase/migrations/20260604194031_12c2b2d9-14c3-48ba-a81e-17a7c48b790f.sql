-- ──────────────────────────────────────────────────────────
-- H&L Pay AR Suite — Database schema
-- ──────────────────────────────────────────────────────────

-- =========================================================
-- 1. venue_billing_accounts
-- =========================================================
CREATE TABLE public.venue_billing_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  stripe_customer_id    text,
  default_payment_method_id  text,
  payment_method_type   text NOT NULL DEFAULT 'manual'
    CHECK (payment_method_type IN ('card','ach','becs','manual')),
  billing_email         text,
  billing_name          text,
  billing_address       jsonb DEFAULT '{}',
  is_active             boolean NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_billing_accounts TO authenticated;
GRANT ALL ON public.venue_billing_accounts TO service_role;
ALTER TABLE public.venue_billing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all billing accounts"
  ON public.venue_billing_accounts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own billing account"
  ON public.venue_billing_accounts FOR SELECT
  TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE INDEX idx_vba_venue ON public.venue_billing_accounts(venue_id);

-- =========================================================
-- 2. venue_payment_methods
-- =========================================================
CREATE TABLE public.venue_payment_methods (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  stripe_payment_method_id text NOT NULL,
  type                    text NOT NULL CHECK (type IN ('card','ach','becs','manual')),
  brand                   text,
  last4                   text,
  exp_month               int,
  exp_year                int,
  bank_name               text,
  bsb_last4               text,
  routing_last4           text,
  mandate_id              text,
  mandate_status          text,
  mandate_accepted_at     timestamptz,
  mandate_ip              text,
  fingerprint             text,
  is_default              boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,
  billing_details         jsonb DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_payment_methods TO authenticated;
GRANT ALL ON public.venue_payment_methods TO service_role;
ALTER TABLE public.venue_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all payment methods"
  ON public.venue_payment_methods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own payment methods"
  ON public.venue_payment_methods FOR SELECT
  TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE INDEX idx_vpm_venue ON public.venue_payment_methods(venue_id);
CREATE INDEX idx_vpm_stripe ON public.venue_payment_methods(stripe_payment_method_id);

-- =========================================================
-- 3. ar_onboarding_tokens
-- =========================================================
CREATE TABLE public.ar_onboarding_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  token_hash       text NOT NULL,
  methods_allowed  text[] NOT NULL DEFAULT ARRAY['card','becs']::text[],
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ar_onboarding_tokens TO authenticated;
GRANT ALL ON public.ar_onboarding_tokens TO service_role;
ALTER TABLE public.ar_onboarding_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can manage onboarding tokens"
  ON public.ar_onboarding_tokens FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE UNIQUE INDEX idx_aot_token ON public.ar_onboarding_tokens(token_hash);
CREATE INDEX idx_aot_venue ON public.ar_onboarding_tokens(venue_id);

-- =========================================================
-- 4. venue_invoices
-- =========================================================
CREATE TABLE public.venue_invoices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  invoice_number            text NOT NULL UNIQUE,
  period_start              date NOT NULL,
  period_end                date NOT NULL,
  due_date                  date NOT NULL,
  commission_amount         numeric(12,2) NOT NULL DEFAULT 0,
  min_fee_amount            numeric(12,2) NOT NULL DEFAULT 0,
  adjustments               numeric(12,2) NOT NULL DEFAULT 0,
  subtotal                  numeric(12,2) NOT NULL DEFAULT 0,
  tax                       numeric(12,2) NOT NULL DEFAULT 0,
  total                     numeric(12,2) NOT NULL DEFAULT 0,
  currency                  text NOT NULL DEFAULT 'AUD',
  status                    text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','paid','partially_paid','failed','void','uncollectible','manual_pending')),
  pdf_url                   text,
  stripe_payment_intent_id  text,
  attempt_count             int NOT NULL DEFAULT 0,
  next_retry_at             timestamptz,
  paid_at                   timestamptz,
  voided_at                 timestamptz,
  voided_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason               text,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_invoices TO authenticated;
GRANT ALL ON public.venue_invoices TO service_role;
ALTER TABLE public.venue_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all invoices"
  ON public.venue_invoices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own invoices"
  ON public.venue_invoices FOR SELECT
  TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE INDEX idx_vi_venue ON public.venue_invoices(venue_id);
CREATE INDEX idx_vi_status_due ON public.venue_invoices(status, due_date);
CREATE INDEX idx_vi_next_retry ON public.venue_invoices(next_retry_at) WHERE status = 'failed';
CREATE INDEX idx_vi_period ON public.venue_invoices(period_start, period_end);
CREATE INDEX idx_vi_stripe ON public.venue_invoices(stripe_payment_intent_id);

-- =========================================================
-- 5. venue_invoice_lines
-- =========================================================
CREATE TABLE public.venue_invoice_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.venue_invoices(id) ON DELETE CASCADE,
  line_type    text NOT NULL CHECK (line_type IN ('commission','min_fee','adjustment','credit','tax')),
  description  text NOT NULL,
  quantity     numeric(12,4) NOT NULL DEFAULT 1,
  unit_price   numeric(12,2) NOT NULL DEFAULT 0,
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  currency     text NOT NULL DEFAULT 'AUD',
  metadata     jsonb DEFAULT '{}',
  display_order int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_invoice_lines TO authenticated;
GRANT ALL ON public.venue_invoice_lines TO service_role;
ALTER TABLE public.venue_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all invoice lines"
  ON public.venue_invoice_lines FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own invoice lines"
  ON public.venue_invoice_lines FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_invoices vi
    WHERE vi.id = invoice_id AND public.is_venue_staff(auth.uid(), vi.venue_id)
  ));
CREATE INDEX idx_vil_invoice ON public.venue_invoice_lines(invoice_id);

-- =========================================================
-- 6. venue_invoice_payments
-- =========================================================
CREATE TABLE public.venue_invoice_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid NOT NULL REFERENCES public.venue_invoices(id) ON DELETE CASCADE,
  stripe_payment_intent_id text,
  amount                   numeric(12,2) NOT NULL DEFAULT 0,
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','failed','refunded')),
  failure_code             text,
  failure_message          text,
  method_type              text CHECK (method_type IN ('card','ach','becs','manual')),
  attempted_at             timestamptz NOT NULL DEFAULT now(),
  settled_at               timestamptz,
  metadata                 jsonb DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_invoice_payments TO authenticated;
GRANT ALL ON public.venue_invoice_payments TO service_role;
ALTER TABLE public.venue_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all invoice payments"
  ON public.venue_invoice_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own invoice payments"
  ON public.venue_invoice_payments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_invoices vi
    WHERE vi.id = invoice_id AND public.is_venue_staff(auth.uid(), vi.venue_id)
  ));
CREATE INDEX idx_vip_invoice ON public.venue_invoice_payments(invoice_id);
CREATE INDEX idx_vip_stripe ON public.venue_invoice_payments(stripe_payment_intent_id);

-- =========================================================
-- 7. venue_billing_events
-- =========================================================
CREATE TABLE public.venue_billing_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  invoice_id  uuid REFERENCES public.venue_invoices(id) ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN (
    'invoice_created','charge_attempted','charge_succeeded','charge_failed',
    'dunning_email_sent','invoice_paid','invoice_voided','invoice_uncollectible',
    'manual_payment_recorded','credit_note_applied','payment_method_added',
    'payment_method_removed','payment_method_default_changed','onboarding_link_sent',
    'onboarding_link_used','batch_started','batch_completed','batch_error'
  )),
  description text,
  metadata    jsonb DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_billing_events TO authenticated;
GRANT ALL ON public.venue_billing_events TO service_role;
ALTER TABLE public.venue_billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all billing events"
  ON public.venue_billing_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own billing events"
  ON public.venue_billing_events FOR SELECT
  TO authenticated
  USING (venue_id IS NULL OR public.is_venue_staff(auth.uid(), venue_id));
CREATE INDEX idx_vbe_venue ON public.venue_billing_events(venue_id);
CREATE INDEX idx_vbe_invoice ON public.venue_billing_events(invoice_id);
CREATE INDEX idx_vbe_type ON public.venue_billing_events(event_type, created_at DESC);

-- =========================================================
-- 8. venue_credit_notes
-- =========================================================
CREATE TABLE public.venue_credit_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  invoice_id      uuid REFERENCES public.venue_invoices(id) ON DELETE SET NULL,
  credit_number   text NOT NULL UNIQUE,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'AUD',
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','void')),
  applied_to_ids  uuid[] DEFAULT '{}',
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_credit_notes TO authenticated;
GRANT ALL ON public.venue_credit_notes TO service_role;
ALTER TABLE public.venue_credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all credit notes"
  ON public.venue_credit_notes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Venue staff can read their own credit notes"
  ON public.venue_credit_notes FOR SELECT
  TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE INDEX idx_vcn_venue ON public.venue_credit_notes(venue_id);

-- =========================================================
-- 9. ar_dunning_schedules
-- =========================================================
CREATE TABLE public.ar_dunning_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  is_default          boolean NOT NULL DEFAULT false,
  retry_days          int[] NOT NULL DEFAULT ARRAY[3,7,14,21],
  max_attempts        int NOT NULL DEFAULT 5,
  auto_suspend        boolean NOT NULL DEFAULT false,
  suspend_after_attempts int,
  escalate_email      boolean NOT NULL DEFAULT true,
  in_app_alert        boolean NOT NULL DEFAULT true,
  mark_uncollectible  boolean NOT NULL DEFAULT true,
  uncollectible_after_attempts int NOT NULL DEFAULT 5,
  grace_period_days   int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ar_dunning_schedules TO authenticated;
GRANT ALL ON public.ar_dunning_schedules TO service_role;
ALTER TABLE public.ar_dunning_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage dunning schedules"
  ON public.ar_dunning_schedules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Authenticated users can read dunning schedules"
  ON public.ar_dunning_schedules FOR SELECT
  TO authenticated
  USING (true);

-- Seed the default Gentle schedule
INSERT INTO public.ar_dunning_schedules (name, is_default, retry_days, max_attempts, auto_suspend, escalate_email, in_app_alert, mark_uncollectible, uncollectible_after_attempts, grace_period_days)
VALUES ('Gentle — default', true, ARRAY[3,7,14,21], 5, false, true, true, true, 5, 0);

-- =========================================================
-- 10. processed_stripe_events
-- =========================================================
CREATE TABLE public.processed_stripe_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type      text NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processed_stripe_events TO authenticated;
GRANT ALL ON public.processed_stripe_events TO service_role;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage processed events"
  ON public.processed_stripe_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Service role unrestricted"
  ON public.processed_stripe_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
CREATE INDEX idx_pse_event ON public.processed_stripe_events(stripe_event_id);

-- =========================================================
-- Update triggers
-- =========================================================
CREATE TRIGGER update_vba_updated_at BEFORE UPDATE ON public.venue_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vpm_updated_at BEFORE UPDATE ON public.venue_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vi_updated_at BEFORE UPDATE ON public.venue_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vcn_updated_at BEFORE UPDATE ON public.venue_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON public.ar_dunning_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Helper function: ensure a Stripe customer exists
-- =========================================================
CREATE OR REPLACE FUNCTION public.ensure_stripe_customer_for_venue(
  _venue_id uuid,
  _stripe_customer_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing text;
  _venue_name text;
  _venue_email text;
BEGIN
  SELECT stripe_customer_id INTO _existing
  FROM public.venue_billing_accounts
  WHERE venue_id = _venue_id;

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT name, email INTO _venue_name, _venue_email
  FROM public.venues WHERE id = _venue_id;

  INSERT INTO public.venue_billing_accounts (
    venue_id, stripe_customer_id, billing_email, billing_name, is_active
  ) VALUES (
    _venue_id,
    COALESCE(_stripe_customer_id, 'pending_' || gen_random_uuid()::text),
    _venue_email,
    _venue_name,
    true
  )
  ON CONFLICT (venue_id) DO UPDATE
  SET stripe_customer_id = EXCLUDED.stripe_customer_id
  WHERE public.venue_billing_accounts.stripe_customer_id IS NULL
    OR public.venue_billing_accounts.stripe_customer_id LIKE 'pending_%';

  SELECT stripe_customer_id INTO _existing
  FROM public.venue_billing_accounts WHERE venue_id = _venue_id;

  RETURN _existing;
END;
$$;

-- =========================================================
-- Dashboard RPC: get_ar_dashboard
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ar_dashboard(
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH open_inv AS (
    SELECT * FROM public.venue_invoices WHERE status = 'open'
  ),
  overdue AS (
    SELECT * FROM public.venue_invoices WHERE status = 'open' AND due_date < CURRENT_DATE
  ),
  failed AS (
    SELECT * FROM public.venue_invoices WHERE status = 'failed'
  ),
  paid_period AS (
    SELECT * FROM public.venue_invoices WHERE status IN ('paid','partially_paid') AND paid_at >= _from AND paid_at <= _to
  ),
  aging AS (
    SELECT
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date <= 30 AND CURRENT_DATE - due_date >= 0) AS d0_30,
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60) AS d31_60,
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90) AS d61_90,
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date > 90) AS d90_plus
    FROM public.venue_invoices
    WHERE status = 'open'
  ),
  upcoming AS (
    SELECT COUNT(*)::int AS c FROM public.venue_invoices
    WHERE status = 'open' AND due_date <= CURRENT_DATE + interval '7 days'
  ),
  top_failures AS (
    SELECT jsonb_agg(jsonb_build_object(
      'invoice_id', id, 'venue_id', venue_id, 'venue_name', v.name,
      'total', total, 'due_date', due_date, 'attempt_count', attempt_count
    ) ORDER BY due_date DESC) AS list
    FROM (SELECT * FROM public.venue_invoices WHERE status = 'failed' ORDER BY due_date DESC LIMIT 10) vi
    JOIN public.venues v ON v.id = vi.venue_id
  )
  SELECT jsonb_build_object(
    'open_invoices', (SELECT COUNT(*)::int FROM open_inv),
    'open_total', (SELECT COALESCE(SUM(total),0)::numeric FROM open_inv),
    'overdue_invoices', (SELECT COUNT(*)::int FROM overdue),
    'overdue_total', (SELECT COALESCE(SUM(total),0)::numeric FROM overdue),
    'failed_invoices', (SELECT COUNT(*)::int FROM failed),
    'failed_total', (SELECT COALESCE(SUM(total),0)::numeric FROM failed),
    'collected_period', (SELECT COALESCE(SUM(total),0)::numeric FROM paid_period),
    'collected_count', (SELECT COUNT(*)::int FROM paid_period),
    'aging', jsonb_build_object(
      '0_30', (SELECT d0_30 FROM aging),
      '31_60', (SELECT d31_60 FROM aging),
      '61_90', (SELECT d61_60 FROM aging),
      '90_plus', (SELECT d90_plus FROM aging)
    ),
    'upcoming_due_count', (SELECT c FROM upcoming),
    'top_failures', COALESCE((SELECT list FROM top_failures), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

-- =========================================================
-- List invoices RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.list_ar_invoices(
  _status text[] DEFAULT NULL,
  _venue_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, venue_id uuid, venue_name text, invoice_number text,
  period_start date, period_end date, due_date date,
  total numeric, currency text, status text,
  attempt_count int, paid_at timestamptz, created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT vi.*, v.name AS venue_name
    FROM public.venue_invoices vi
    JOIN public.venues v ON v.id = vi.venue_id
    WHERE (_status IS NULL OR vi.status = ANY(_status))
      AND (_venue_id IS NULL OR vi.venue_id = _venue_id)
      AND (_search IS NULL OR vi.invoice_number ILIKE '%' || _search || '%' OR v.name ILIKE '%' || _search || '%')
      AND (_from IS NULL OR vi.due_date >= _from)
      AND (_to IS NULL OR vi.due_date <= _to)
  ),
  counted AS (SELECT COUNT(*) AS c FROM filtered)
  SELECT
    f.id, f.venue_id, f.venue_name, f.invoice_number,
    f.period_start, f.period_end, f.due_date,
    f.total, f.currency, f.status,
    f.attempt_count, f.paid_at, f.created_at,
    (SELECT c FROM counted)
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

-- =========================================================
-- Invoice number generator
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _seq int;
  _num text;
BEGIN
  SELECT COALESCE(MAX(
    (regexp_match(invoice_number, 'INV-(\d{6})-.*'))[1]::int
  ), 0) + 1 INTO _seq
  FROM public.venue_invoices
  WHERE invoice_number LIKE 'INV-' || to_char(CURRENT_DATE, 'YYYYMM') || '%';

  _num := 'INV-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(_seq::text, 4, '0');
  RETURN _num;
END;
$$;

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION public.ensure_stripe_customer_for_venue TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_stripe_customer_for_venue TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ar_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ar_dashboard TO service_role;
GRANT EXECUTE ON FUNCTION public.list_ar_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ar_invoices TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number TO service_role;
