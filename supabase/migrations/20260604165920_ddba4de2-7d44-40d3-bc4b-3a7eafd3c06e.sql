
ALTER TABLE public.venue_billing_config
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS billing_day_of_month integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_annual_gmv numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_term_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS notice_period_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.venue_billing_config
  DROP CONSTRAINT IF EXISTS venue_billing_config_billing_day_chk;
ALTER TABLE public.venue_billing_config
  ADD CONSTRAINT venue_billing_config_billing_day_chk CHECK (billing_day_of_month BETWEEN 1 AND 28);

CREATE OR REPLACE FUNCTION public.get_platform_financials(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Resolve effective billing config (inherit_from_group → parent venue config)
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
      COALESCE(own.auto_renew, true) AS auto_renew,
      COALESCE(own.renewal_term_months, 12) AS renewal_term_months
    FROM v
    LEFT JOIN public.venue_billing_config own ON own.venue_id = v.id
    LEFT JOIN parent_cfg pc ON pc.group_id = v.group_id
  ),
  -- Net revenue ex tax incl tips = sum(order_items.unit_price * qty) + sum(gratuity_amount)
  rev AS (
    SELECT
      o.venue_id,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS items_subtotal,
      COALESCE(MAX(g.gratuities), 0)::numeric AS gratuities,
      COUNT(DISTINCT o.id)::int AS billable_orders
    FROM public.orders o
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT SUM(o2.gratuity_amount) AS gratuities
      FROM public.orders o2
      WHERE o2.venue_id = o.venue_id
        AND o2.status <> 'cancelled'
        AND o2.created_at >= _from AND o2.created_at <= _to
    ) g ON true
    WHERE o.status <> 'cancelled'
      AND o.created_at >= _from AND o.created_at <= _to
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
      ROUND(eff.estimated_annual_gmv * eff.commission_percent / 100.0, 2) AS forecast_annual_commission
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
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_financials(timestamptz, timestamptz) TO authenticated, service_role;
