-- Diner web sessions: tracks lifecycle of each diner's visit to the consumer web app
CREATE TABLE public.diner_web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  table_id uuid NULL,
  diner_id uuid NULL,
  session_mode text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  end_reason text NULL,
  first_add_to_cart_at timestamptz NULL,
  reached_checkout_at timestamptz NULL,
  order_placed_at timestamptz NULL,
  order_id uuid NULL,
  items_added_count int NOT NULL DEFAULT 0,
  cart_value_peak_cents int NOT NULL DEFAULT 0,
  user_agent text NULL
);

CREATE INDEX idx_dws_venue_started ON public.diner_web_sessions (venue_id, started_at DESC);
CREATE INDEX idx_dws_venue_end_reason ON public.diner_web_sessions (venue_id, end_reason);
CREATE INDEX idx_dws_open ON public.diner_web_sessions (last_activity_at) WHERE ended_at IS NULL;

ALTER TABLE public.diner_web_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can start a web session"
  ON public.diner_web_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (venue_id IS NOT NULL);

CREATE POLICY "Anyone can update a web session by id"
  ON public.diner_web_sessions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (venue_id IS NOT NULL);

CREATE POLICY "Staff can view venue web sessions"
  ON public.diner_web_sessions FOR SELECT
  TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id) OR has_role(auth.uid(), 'tabless_admin'::app_role));

-- Idle session sweep (safety net for tabs that died without sendBeacon)
CREATE OR REPLACE FUNCTION public.close_idle_web_sessions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  WITH closed AS (
    UPDATE public.diner_web_sessions
    SET ended_at = now(),
        end_reason = COALESCE(end_reason, 'idle_timeout')
    WHERE ended_at IS NULL
      AND last_activity_at < now() - interval '15 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM closed;
  RETURN _count;
END;
$$;

-- Daily metrics view per venue
CREATE OR REPLACE VIEW public.diner_session_metrics_daily
WITH (security_invoker = true)
AS
SELECT
  venue_id,
  date_trunc('day', started_at)::date AS day,
  count(*)::int AS sessions,
  count(*) FILTER (WHERE first_add_to_cart_at IS NOT NULL)::int AS sessions_with_cart,
  count(*) FILTER (WHERE reached_checkout_at IS NOT NULL)::int AS sessions_with_checkout,
  count(*) FILTER (WHERE order_placed_at IS NOT NULL)::int AS sessions_converted,
  count(*) FILTER (WHERE first_add_to_cart_at IS NOT NULL AND order_placed_at IS NULL)::int AS cart_abandoned,
  count(*) FILTER (WHERE reached_checkout_at IS NOT NULL AND order_placed_at IS NULL)::int AS checkout_abandoned,
  ROUND(
    100.0 * count(*) FILTER (WHERE order_placed_at IS NOT NULL)
    / NULLIF(count(*), 0),
    2
  ) AS conversion_rate,
  ROUND(
    100.0 * count(*) FILTER (WHERE first_add_to_cart_at IS NOT NULL AND order_placed_at IS NULL)
    / NULLIF(count(*) FILTER (WHERE first_add_to_cart_at IS NOT NULL), 0),
    2
  ) AS cart_abandon_rate,
  ROUND(
    100.0 * count(*) FILTER (WHERE reached_checkout_at IS NOT NULL AND order_placed_at IS NULL)
    / NULLIF(count(*) FILTER (WHERE reached_checkout_at IS NOT NULL), 0),
    2
  ) AS checkout_abandon_rate
FROM public.diner_web_sessions
GROUP BY venue_id, date_trunc('day', started_at)::date;