-- Dayend auto-close (Kent, 2026-08-25).
--
-- The Close Day action gains open-order gates, an optional auto-run, and an
-- "Internal Accounting" payment type for orders swept by the close:
--
--   * venue_dayend_settings — per-venue: auto-close on/off, the venue-local
--     time it runs, and the open-order strategy:
--       'halt'      — refuse to close while open orders exist (default;
--                     the venue must resolve them first)
--       'autoclose' — sweep open orders to payment_method
--                     'internal_autoclose' (status → paid) and close; they
--                     surface in the DayEnd reporting area where staff can
--                     reopen (re-close to the correct payment) or void them.
--   * orders.payment_method — new column; the close writes
--     'internal_autoclose'. Future values ('card','cash','comp') welcome.
--   * dayend_close() — the whole close as one atomic SECURITY DEFINER step,
--     callable only by service_role: the dayend-close edge function fronts it
--     for both the manual Close Day button (manager JWT) and the pg_cron tick.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

CREATE TABLE public.venue_dayend_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  auto_close_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Venue-local wall-clock time the auto close runs (timezone from venues.timezone).
  auto_close_time TIME NOT NULL DEFAULT '04:00',
  open_order_strategy TEXT NOT NULL DEFAULT 'halt'
    CHECK (open_order_strategy IN ('halt','autoclose')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_venue_dayend_settings_updated_at
  BEFORE UPDATE ON public.venue_dayend_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venue_dayend_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.venue_dayend_settings TO authenticated;
GRANT ALL ON public.venue_dayend_settings TO service_role;

CREATE POLICY "Staff read dayend settings" ON public.venue_dayend_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_staff vs
    WHERE vs.venue_id = venue_dayend_settings.venue_id
      AND vs.user_id = auth.uid() AND vs.is_active = true
  ));

-- Closing the day moves money-adjacent state; only owners/managers configure it.
CREATE POLICY "Managers write dayend settings" ON public.venue_dayend_settings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_staff vs
    WHERE vs.venue_id = venue_dayend_settings.venue_id
      AND vs.user_id = auth.uid() AND vs.is_active = true
      AND vs.role IN ('owner','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.venue_staff vs
    WHERE vs.venue_id = venue_dayend_settings.venue_id
      AND vs.user_id = auth.uid() AND vs.is_active = true
      AND vs.role IN ('owner','manager')
  ));

-- ---------------------------------------------------------------------------
-- Close-log detail + the Internal Accounting payment type
-- ---------------------------------------------------------------------------

ALTER TABLE public.venue_dayend_log
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','auto')),
  ADD COLUMN orders_autoclosed INT NOT NULL DEFAULT 0;

ALTER TABLE public.orders ADD COLUMN payment_method TEXT;
CREATE INDEX idx_orders_internal_autoclose
  ON public.orders (venue_id, audit_date)
  WHERE payment_method = 'internal_autoclose';

-- ---------------------------------------------------------------------------
-- The close itself — one atomic step, service_role only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dayend_close(_venue_id UUID, _actor UUID, _mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_date DATE;
  _strategy TEXT;
  _open_count INT;
  _swept INT := 0;
BEGIN
  IF _mode NOT IN ('manual','auto') THEN
    RAISE EXCEPTION 'Invalid mode %', _mode;
  END IF;

  SELECT audit_date INTO _old_date
  FROM venue_audit_dates WHERE venue_id = _venue_id FOR UPDATE;
  IF _old_date IS NULL THEN
    RAISE EXCEPTION 'Audit date not initialized for this venue';
  END IF;

  SELECT COALESCE(
    (SELECT open_order_strategy FROM venue_dayend_settings WHERE venue_id = _venue_id),
    'halt'
  ) INTO _strategy;

  SELECT count(*) INTO _open_count
  FROM orders
  WHERE venue_id = _venue_id
    AND status IN ('received','preparing','ready','served');

  IF _open_count > 0 AND _strategy = 'halt' THEN
    RETURN jsonb_build_object(
      'halted', true,
      'open_orders', _open_count,
      'closed_date', NULL,
      'new_date', NULL
    );
  END IF;

  IF _open_count > 0 THEN
    -- Sweep to Internal Accounting. Status flow: paid is terminal, and the
    -- reporting area offers reopen (status reset + payment cleared) or void.
    UPDATE orders
    SET status = 'paid',
        payment_status = 'paid',
        payment_method = 'internal_autoclose'
    WHERE venue_id = _venue_id
      AND status IN ('received','preparing','ready','served');
    GET DIAGNOSTICS _swept = ROW_COUNT;
  END IF;

  INSERT INTO venue_dayend_log (venue_id, audit_date, closed_by, mode, orders_autoclosed)
  VALUES (_venue_id, _old_date, _actor, _mode, _swept);

  UPDATE venue_audit_dates
  SET audit_date = _old_date + 1, advanced_by = _actor, advanced_at = now()
  WHERE venue_id = _venue_id;

  RETURN jsonb_build_object(
    'halted', false,
    'open_orders', _open_count,
    'orders_autoclosed', _swept,
    'closed_date', _old_date,
    'new_date', _old_date + 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dayend_close(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dayend_close(UUID, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Auto-run tick — every 10 minutes; the edge function decides per venue
-- whether its local auto_close_time has passed. Same Vault-driven pattern as
-- pos-outbound-worker (project_url + cron_secret created once per environment).
-- ---------------------------------------------------------------------------

SELECT cron.unschedule('dayend-autoclose-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dayend-autoclose-tick');

SELECT cron.schedule(
  'dayend-autoclose-tick',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
    ) || '/functions/v1/dayend-close',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'
      )
    ),
    body    := '{"tick": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
