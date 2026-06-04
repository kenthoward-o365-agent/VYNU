
-- 1. Fix gratuity scan in get_platform_financials
CREATE OR REPLACE FUNCTION public.get_platform_financials(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _months_in_period numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  _months_in_period := GREATEST(EXTRACT(EPOCH FROM (_to - _from)) / (60*60*24*30.4375), 0);

  WITH v AS (
    SELECT id, name, venue_type, is_active, group_id, created_at
    FROM public.venues
  ),
  parent_cfg AS (
    SELECT vbc.*, pv.group_id
    FROM public.venue_billing_config vbc
    JOIN public.venues pv ON pv.id = vbc.venue_id
    WHERE pv.venue_type = 'parent'
  ),
  eff AS (
    SELECT
      v.id AS venue_id,
      COALESCE(
        CASE WHEN own.inherit_from_group AND own.venue_id IS NOT NULL AND v.group_id IS NOT NULL
             THEN pc.commission_percent ELSE own.commission_percent END,
        pc.commission_percent, 0
      ) AS commission_percent,
      COALESCE(
        CASE WHEN own.inherit_from_group AND own.venue_id IS NOT NULL AND v.group_id IS NOT NULL
             THEN pc.min_monthly_fee ELSE own.min_monthly_fee END,
        pc.min_monthly_fee, 0
      ) AS min_monthly_fee,
      COALESCE(own.billing_currency, pc.billing_currency, 'AUD') AS billing_currency,
      own.contract_start_date,
      own.contract_end_date,
      COALESCE(own.billing_day_of_month, 1) AS billing_day_of_month,
      COALESCE(own.estimated_annual_gmv, 0) AS estimated_annual_gmv,
      COALESCE(own.qr_gmv_percent, 100) AS qr_gmv_percent,
      COALESCE(own.auto_renew, true) AS auto_renew,
      COALESCE(own.renewal_term_months, 12) AS renewal_term_months
    FROM v
    LEFT JOIN public.venue_billing_config own ON own.venue_id = v.id
    LEFT JOIN parent_cfg pc ON pc.group_id = v.group_id
  ),
  rev AS (
    SELECT
      o.venue_id,
      COALESCE(SUM(o.subtotal_with_items), 0)::numeric AS items_subtotal,
      COALESCE(SUM(o.gratuity_amount), 0)::numeric AS gratuities,
      COUNT(*)::int AS billable_orders
    FROM (
      SELECT o.id, o.venue_id, o.gratuity_amount,
        (SELECT COALESCE(SUM(oi.unit_price * oi.quantity),0) FROM public.order_items oi WHERE oi.order_id = o.id) AS subtotal_with_items
      FROM public.orders o
      WHERE o.status <> 'cancelled'
        AND o.created_at >= _from AND o.created_at <= _to
    ) o
    GROUP BY o.venue_id
  ),
  per_venue AS (
    SELECT
      v.id AS venue_id,
      v.name,
      v.venue_type,
      v.is_active,
      eff.commission_percent,
      eff.min_monthly_fee,
      eff.billing_currency,
      eff.contract_start_date,
      eff.contract_end_date,
      eff.billing_day_of_month,
      eff.estimated_annual_gmv,
      eff.qr_gmv_percent,
      eff.auto_renew,
      eff.renewal_term_months,
      COALESCE(rev.items_subtotal, 0) + COALESCE(rev.gratuities, 0) AS net_revenue,
      COALESCE(rev.billable_orders, 0) AS billable_orders,
      ROUND((COALESCE(rev.items_subtotal, 0) + COALESCE(rev.gratuities, 0)) * eff.commission_percent / 100.0, 2) AS commission_earned,
      ROUND(eff.min_monthly_fee * _months_in_period, 2) AS min_fee_due,
      CASE
        WHEN eff.contract_end_date IS NULL THEN NULL
        ELSE GREATEST(
          (EXTRACT(YEAR FROM age(eff.contract_end_date::timestamp, CURRENT_DATE::timestamp)) * 12
           + EXTRACT(MONTH FROM age(eff.contract_end_date::timestamp, CURRENT_DATE::timestamp)))::int,
          0
        )
      END AS months_remaining,
      ROUND(eff.estimated_annual_gmv * (eff.qr_gmv_percent / 100.0) * eff.commission_percent / 100.0, 2) AS forecast_annual_commission
    FROM v
    JOIN eff ON eff.venue_id = v.id
    LEFT JOIN rev ON rev.venue_id = v.id
  ),
  enriched AS (
    SELECT
      pv.*,
      ROUND(pv.min_monthly_fee * COALESCE(pv.months_remaining, 0), 2) AS deferred_min_fee_revenue,
      pv.commission_earned + pv.min_fee_due AS total_billable
    FROM per_venue pv
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE is_active IS NOT false)::int AS active_venues,
      COUNT(*)::int AS total_venues,
      COALESCE(SUM(net_revenue), 0)::numeric AS net_revenue,
      COALESCE(SUM(commission_earned), 0)::numeric AS commission_earned,
      COALESCE(SUM(min_fee_due), 0)::numeric AS min_fee_due,
      COALESCE(SUM(total_billable), 0)::numeric AS total_billable,
      COALESCE(SUM(deferred_min_fee_revenue), 0)::numeric AS deferred_revenue,
      COALESCE(SUM(forecast_annual_commission), 0)::numeric AS forecast_annual_commission,
      COALESCE(SUM(estimated_annual_gmv), 0)::numeric AS estimated_annual_gmv
    FROM enriched
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to, 'months', _months_in_period),
    'totals', to_jsonb((SELECT t FROM totals t)),
    'venues', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.total_billable DESC) FROM enriched e), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$function$;

-- 2. New admin dashboard RPC
CREATE OR REPLACE FUNCTION public.get_admin_dashboard(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH ord AS (
    SELECT id, venue_id, total, status, created_at
    FROM public.orders
    WHERE created_at >= _from AND created_at <= _to
  ),
  billable AS (SELECT * FROM ord WHERE status <> 'cancelled'),
  venue_stats AS (
    SELECT
      venue_id,
      COUNT(*) AS orders_count,
      COUNT(*) FILTER (WHERE status <> 'cancelled') AS billable_count,
      COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::numeric AS revenue
    FROM ord
    GROUP BY venue_id
  ),
  venue_list AS (
    SELECT v.id, v.name, v.venue_type, v.is_active,
           COALESCE(vs.orders_count, 0)::int AS orders_count,
           COALESCE(vs.revenue, 0)::numeric AS revenue
    FROM public.venues v
    LEFT JOIN venue_stats vs ON vs.venue_id = v.id
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM public.venues WHERE is_active IS NOT false)::int AS active_venues,
      (SELECT COUNT(*) FROM public.venues)::int AS total_venues,
      (SELECT COUNT(*) FROM ord)::int AS total_orders,
      (SELECT COUNT(*) FROM billable)::int AS billable_orders,
      (SELECT COALESCE(SUM(total),0) FROM billable)::numeric AS gross_revenue
  ),
  status_counts AS (
    SELECT jsonb_object_agg(status, c) AS map FROM (
      SELECT status, COUNT(*) AS c FROM ord GROUP BY status
    ) x
  ),
  top_venues AS (
    SELECT jsonb_agg(jsonb_build_object('venue_id', id, 'name', name, 'revenue', revenue) ORDER BY revenue DESC) AS list
    FROM (SELECT id, name, revenue FROM venue_list ORDER BY revenue DESC LIMIT 10) t
  ),
  recent AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'venue_id', o.venue_id, 'venue_name', v.name,
      'total', o.total, 'status', o.status, 'created_at', o.created_at
    ) ORDER BY o.created_at DESC) AS list
    FROM (SELECT * FROM ord ORDER BY created_at DESC LIMIT 20) o
    LEFT JOIN public.venues v ON v.id = o.venue_id
  )
  SELECT jsonb_build_object(
    'totals', to_jsonb((SELECT t FROM totals t)),
    'status_counts', COALESCE((SELECT map FROM status_counts), '{}'::jsonb),
    'top_venues', COALESCE((SELECT list FROM top_venues), '[]'::jsonb),
    'venues', COALESCE((SELECT jsonb_agg(to_jsonb(vl) ORDER BY vl.revenue DESC) FROM venue_list vl), '[]'::jsonb),
    'recent_orders', COALESCE((SELECT list FROM recent), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$function$;

-- 3. Server-side paginated venue search
CREATE OR REPLACE FUNCTION public.search_admin_venues(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _venue_type text DEFAULT NULL,
  _limit int DEFAULT 25,
  _offset int DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _total int;
  _q text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  _q := NULLIF(trim(COALESCE(_search, '')), '');

  WITH filtered AS (
    SELECT v.id, v.name, v.venue_type, v.city, v.state, v.is_active,
           v.subscription_status, v.subscription_plan, v.group_id, v.created_at
    FROM public.venues v
    WHERE v.name NOT ILIKE 'LOADTEST_%'
      AND (_q IS NULL OR v.name ILIKE '%' || _q || '%' OR COALESCE(v.city,'') ILIKE '%' || _q || '%')
      AND (_status IS NULL OR _status = 'all' OR v.subscription_status = _status)
      AND (_venue_type IS NULL OR _venue_type = 'all' OR v.venue_type = _venue_type)
  )
  SELECT COUNT(*) INTO _total FROM filtered;

  WITH filtered AS (
    SELECT v.id, v.name, v.venue_type, v.city, v.state, v.is_active,
           v.subscription_status, v.subscription_plan, v.group_id, v.created_at
    FROM public.venues v
    WHERE v.name NOT ILIKE 'LOADTEST_%'
      AND (_q IS NULL OR v.name ILIKE '%' || _q || '%' OR COALESCE(v.city,'') ILIKE '%' || _q || '%')
      AND (_status IS NULL OR _status = 'all' OR v.subscription_status = _status)
      AND (_venue_type IS NULL OR _venue_type = 'all' OR v.venue_type = _venue_type)
    ORDER BY v.name
    LIMIT _limit OFFSET _offset
  ),
  with_billing AS (
    SELECT f.*, vbc.commission_percent
    FROM filtered f
    LEFT JOIN public.venue_billing_config vbc ON vbc.venue_id = f.id
  )
  SELECT jsonb_build_object(
    'total', _total,
    'venues', COALESCE(jsonb_agg(to_jsonb(wb) ORDER BY wb.name), '[]'::jsonb)
  ) INTO _result
  FROM with_billing wb;

  RETURN _result;
END;
$function$;
