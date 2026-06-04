CREATE OR REPLACE FUNCTION public.get_venue_performance(_venue_id uuid, _from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _result jsonb;
  _prior_from timestamptz := _from - (_to - _from);
  _prior_to timestamptz := _from;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'tabless_admin'::app_role)
          OR public.is_venue_staff(auth.uid(), _venue_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH ord AS (
    SELECT o.id, o.total, o.gratuity_amount, o.status, o.created_at
    FROM public.orders o
    WHERE o.venue_id = _venue_id
      AND o.created_at >= _from AND o.created_at <= _to
  ),
  ord_billable AS (SELECT * FROM ord WHERE status <> 'cancelled'),
  fin AS (
    SELECT
      COALESCE(SUM(total),0)::numeric AS gross,
      COALESCE(SUM(gratuity_amount),0)::numeric AS gratuities,
      COUNT(*)::int AS billable_count,
      (SELECT COUNT(*) FROM ord)::int AS total_count,
      (SELECT COUNT(*) FROM ord WHERE status = 'cancelled')::int AS cancelled_count
    FROM ord_billable
  ),
  refunds AS (
    SELECT COALESCE(SUM(amount),0)::numeric AS refund_amount, COUNT(*)::int AS refund_count
    FROM public.order_refunds r
    JOIN ord o ON o.id = r.order_id
  ),
  ai_usage AS (
    SELECT
      COALESCE(SUM(cost_usd),0)::numeric AS cost_usd,
      COALESCE(SUM(total_tokens),0)::bigint AS tokens,
      COUNT(*)::int AS calls
    FROM public.ai_usage_log
    WHERE venue_id = _venue_id AND created_at >= _from AND created_at <= _to
  ),
  ai_by_feature AS (
    SELECT jsonb_object_agg(feature, jsonb_build_object('calls', cnt, 'cost_usd', cost, 'tokens', tokens)) AS map
    FROM (
      SELECT feature, COUNT(*) AS cnt, COALESCE(SUM(cost_usd),0)::numeric AS cost, COALESCE(SUM(total_tokens),0)::bigint AS tokens
      FROM public.ai_usage_log
      WHERE venue_id = _venue_id AND created_at >= _from AND created_at <= _to
      GROUP BY feature
    ) x
  ),
  chat AS (
    SELECT
      COUNT(*)::int AS sessions,
      COALESCE(SUM(items_added),0)::int AS items_added,
      COUNT(*) FILTER (WHERE converted_to_order)::int AS converted
    FROM public.chat_sessions
    WHERE venue_id = _venue_id AND started_at >= _from AND started_at <= _to
  ),
  ai_rev AS (
    SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS revenue
    FROM public.order_items oi
    JOIN ord o ON o.id = oi.order_id
    WHERE oi.ai_source IS NOT NULL
  ),
  diners AS (
    SELECT COUNT(DISTINCT diner_id)::int AS unique_diners
    FROM public.diner_visits
    WHERE venue_id = _venue_id AND visited_at >= _from AND visited_at <= _to
  ),
  diners_prior AS (
    SELECT COUNT(DISTINCT diner_id)::int AS unique_diners
    FROM public.diner_visits
    WHERE venue_id = _venue_id AND visited_at >= _prior_from AND visited_at < _prior_to
  ),
  menu AS (
    SELECT COUNT(*)::int AS total_items,
           COUNT(*) FILTER (WHERE price > 0)::int AS priced_items,
           COUNT(*) FILTER (WHERE price IS NULL OR price = 0)::int AS unpriced_items,
           COUNT(*) FILTER (WHERE category_id IS NOT NULL)::int AS categorised_items
    FROM public.menu_items
    WHERE venue_id = _venue_id
  ),
  tbls AS (
    SELECT COUNT(*)::int AS total_tables,
           COUNT(*) FILTER (WHERE COALESCE(status, 'available') <> 'disabled')::int AS active_tables
    FROM public.tables WHERE venue_id = _venue_id
  ),
  staff AS (
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_active)::int AS active
    FROM public.venue_staff WHERE venue_id = _venue_id
  ),
  pos AS (
    SELECT pos_provider, connection_status, auto_push_orders, last_sync_at,
           sync_pos_to_us, sync_us_to_pos
    FROM public.venue_pos_integrations WHERE venue_id = _venue_id
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'financials', jsonb_build_object(
      'gross', (SELECT gross FROM fin),
      'gratuities', (SELECT gratuities FROM fin),
      'net', (SELECT gross - gratuities FROM fin),
      'aov', CASE WHEN (SELECT billable_count FROM fin) > 0
                  THEN (SELECT (gross - gratuities) / billable_count FROM fin) ELSE 0 END,
      'orders_total', (SELECT total_count FROM fin),
      'orders_billable', (SELECT billable_count FROM fin),
      'orders_cancelled', (SELECT cancelled_count FROM fin),
      'refund_amount', (SELECT refund_amount FROM refunds),
      'refund_count', (SELECT refund_count FROM refunds)
    ),
    'ai', jsonb_build_object(
      'cost_usd', (SELECT cost_usd FROM ai_usage),
      'tokens', (SELECT tokens FROM ai_usage),
      'calls', (SELECT calls FROM ai_usage),
      'by_feature', COALESCE((SELECT map FROM ai_by_feature), '{}'::jsonb),
      'chat_sessions', (SELECT sessions FROM chat),
      'items_added', (SELECT items_added FROM chat),
      'sessions_converted', (SELECT converted FROM chat),
      'attributed_revenue', (SELECT revenue FROM ai_rev)
    ),
    'diners', jsonb_build_object(
      'unique', (SELECT unique_diners FROM diners),
      'unique_prior', (SELECT unique_diners FROM diners_prior),
      'trend_pct', CASE WHEN (SELECT unique_diners FROM diners_prior) > 0
        THEN ROUND(((SELECT unique_diners FROM diners)::numeric - (SELECT unique_diners FROM diners_prior))
             / (SELECT unique_diners FROM diners_prior) * 100, 1)
        ELSE NULL END
    ),
    'menu', to_jsonb((SELECT m FROM menu m)),
    'tables', to_jsonb((SELECT t FROM tbls t)),
    'staff', to_jsonb((SELECT s FROM staff s)),
    'pos', COALESCE(to_jsonb((SELECT p FROM pos p)), 'null'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_performance(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_performance(uuid, timestamptz, timestamptz) TO service_role;