
-- ============================================================
-- Phase 1: Diner CRM foundations
-- ============================================================

-- 1) Profile enrichment ------------------------------------------------
ALTER TABLE public.diner_profiles
  ADD COLUMN IF NOT EXISTS marketing_email_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_push_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_e164 text,
  ADD COLUMN IF NOT EXISTS push_subscription jsonb,
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS crm_notes text,
  ADD COLUMN IF NOT EXISTS birthday_month smallint GENERATED ALWAYS AS (EXTRACT(MONTH FROM birthday)::smallint) STORED,
  ADD COLUMN IF NOT EXISTS birthday_day   smallint GENERATED ALWAYS AS (EXTRACT(DAY   FROM birthday)::smallint) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diner_profiles_unsub_token ON public.diner_profiles(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_diner_profiles_birthday_md ON public.diner_profiles(birthday_month, birthday_day);
CREATE INDEX IF NOT EXISTS idx_diner_profiles_email_lower ON public.diner_profiles(lower(email));

-- 2) Per-(diner,venue) rollup stats -----------------------------------
CREATE TABLE IF NOT EXISTS public.diner_venue_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  lifetime_spend numeric(12,2) NOT NULL DEFAULT 0,
  lifetime_orders integer NOT NULL DEFAULT 0,
  avg_ticket numeric(12,2) NOT NULL DEFAULT 0,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  visit_count_90d integer NOT NULL DEFAULT 0,
  spend_last_30d numeric(12,2) NOT NULL DEFAULT 0,
  favourite_category_id uuid,
  favourite_item_id uuid,
  preferred_daypart text,
  rfm_recency smallint,
  rfm_frequency smallint,
  rfm_monetary smallint,
  rfm_tier text,
  churn_risk_score smallint,
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diner_id, venue_id)
);

GRANT SELECT ON public.diner_venue_stats TO authenticated;
GRANT ALL ON public.diner_venue_stats TO service_role;
ALTER TABLE public.diner_venue_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all diner_venue_stats"
  ON public.diner_venue_stats FOR SELECT
  USING (public.has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Staff view diner_venue_stats for their venue"
  ON public.diner_venue_stats FOR SELECT
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Diners view own diner_venue_stats"
  ON public.diner_venue_stats FOR SELECT
  USING (diner_id = public.get_user_diner_profile_id());

CREATE INDEX IF NOT EXISTS idx_dvs_venue ON public.diner_venue_stats(venue_id);
CREATE INDEX IF NOT EXISTS idx_dvs_diner ON public.diner_venue_stats(diner_id);
CREATE INDEX IF NOT EXISTS idx_dvs_tier ON public.diner_venue_stats(venue_id, rfm_tier);

CREATE TRIGGER trg_dvs_updated_at
  BEFORE UPDATE ON public.diner_venue_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Suppression list -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  destination text NOT NULL,
  reason text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, channel, destination)
);

GRANT SELECT ON public.crm_suppression TO authenticated;
GRANT ALL ON public.crm_suppression TO service_role;
ALTER TABLE public.crm_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all suppression"
  ON public.crm_suppression FOR SELECT
  USING (public.has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Staff view suppression for their venue"
  ON public.crm_suppression FOR SELECT
  USING (venue_id IS NULL OR public.is_venue_staff(auth.uid(), venue_id));

CREATE INDEX IF NOT EXISTS idx_crm_suppression_venue ON public.crm_suppression(venue_id, channel);

-- 4) Per-venue CRM/AI campaign config ---------------------------------
CREATE TABLE IF NOT EXISTS public.venue_crm_config (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  ai_campaigns_enabled boolean NOT NULL DEFAULT false,
  ai_daily_send_cap integer NOT NULL DEFAULT 200,
  quiet_hours_start smallint NOT NULL DEFAULT 21,
  quiet_hours_end smallint NOT NULL DEFAULT 9,
  max_discount_pct smallint NOT NULL DEFAULT 20,
  allowed_channels text[] NOT NULL DEFAULT ARRAY['email','in_app'],
  default_tone text NOT NULL DEFAULT 'friendly',
  require_approval boolean NOT NULL DEFAULT false,
  per_diner_frequency_cap_7d smallint NOT NULL DEFAULT 3,
  birthday_reward_enabled boolean NOT NULL DEFAULT true,
  birthday_reward_payload jsonb NOT NULL DEFAULT '{"type":"percent","value":15,"label":"Birthday treat"}'::jsonb,
  default_sender_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_crm_config TO authenticated;
GRANT ALL ON public.venue_crm_config TO service_role;
ALTER TABLE public.venue_crm_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage venue_crm_config"
  ON public.venue_crm_config FOR ALL
  USING (public.has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Managers manage own venue_crm_config"
  ON public.venue_crm_config FOR ALL
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Staff view own venue_crm_config"
  ON public.venue_crm_config FOR SELECT
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE TRIGGER trg_venue_crm_config_updated_at
  BEFORE UPDATE ON public.venue_crm_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Stats refresh function (uses diner_visits as join) ---------------
CREATE OR REPLACE FUNCTION public.refresh_diner_venue_stats(_diner_id uuid, _venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _spend numeric := 0;
  _orders integer := 0;
  _avg numeric := 0;
  _first timestamptz;
  _last timestamptz;
  _v90 integer := 0;
  _s30 numeric := 0;
  _fav_cat uuid;
  _fav_item uuid;
  _daypart text;
  _r smallint;
  _f smallint;
  _m smallint;
  _tier text;
  _days_since integer;
BEGIN
  IF _diner_id IS NULL OR _venue_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(COALESCE(o.total, v.spend_excl_tax, 0)), 0),
    COUNT(*),
    COALESCE(AVG(COALESCE(o.total, v.spend_excl_tax, 0)), 0),
    MIN(v.visited_at),
    MAX(v.visited_at)
  INTO _spend, _orders, _avg, _first, _last
  FROM public.diner_visits v
  LEFT JOIN public.orders o ON o.id = v.order_id AND o.status <> 'cancelled'
  WHERE v.venue_id = _venue_id AND v.diner_id = _diner_id;

  SELECT COUNT(*) INTO _v90
  FROM public.diner_visits
  WHERE venue_id = _venue_id AND diner_id = _diner_id
    AND visited_at >= now() - interval '90 days';

  SELECT COALESCE(SUM(COALESCE(o.total, v.spend_excl_tax, 0)), 0) INTO _s30
  FROM public.diner_visits v
  LEFT JOIN public.orders o ON o.id = v.order_id AND o.status <> 'cancelled'
  WHERE v.venue_id = _venue_id AND v.diner_id = _diner_id
    AND v.visited_at >= now() - interval '30 days';

  SELECT mi.category_id INTO _fav_cat
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.diner_visits v ON v.order_id = o.id
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  WHERE v.venue_id = _venue_id AND v.diner_id = _diner_id AND o.status <> 'cancelled'
  GROUP BY mi.category_id
  ORDER BY SUM(oi.quantity) DESC NULLS LAST
  LIMIT 1;

  SELECT oi.menu_item_id INTO _fav_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.diner_visits v ON v.order_id = o.id
  WHERE v.venue_id = _venue_id AND v.diner_id = _diner_id AND o.status <> 'cancelled'
  GROUP BY oi.menu_item_id
  ORDER BY SUM(oi.quantity) DESC NULLS LAST
  LIMIT 1;

  SELECT CASE
    WHEN h BETWEEN 5 AND 10  THEN 'breakfast'
    WHEN h BETWEEN 11 AND 14 THEN 'lunch'
    WHEN h BETWEEN 15 AND 17 THEN 'afternoon'
    WHEN h BETWEEN 18 AND 21 THEN 'dinner'
    ELSE 'late_night'
  END INTO _daypart
  FROM (
    SELECT EXTRACT(HOUR FROM v.visited_at)::int AS h, COUNT(*) AS c
    FROM public.diner_visits v
    WHERE v.venue_id = _venue_id AND v.diner_id = _diner_id
    GROUP BY 1 ORDER BY c DESC LIMIT 1
  ) t;

  _days_since := COALESCE(EXTRACT(DAY FROM (now() - _last))::int, 9999);
  _r := CASE
          WHEN _days_since <= 14 THEN 5
          WHEN _days_since <= 30 THEN 4
          WHEN _days_since <= 60 THEN 3
          WHEN _days_since <= 120 THEN 2
          ELSE 1 END;
  _f := CASE
          WHEN _orders >= 20 THEN 5
          WHEN _orders >= 10 THEN 4
          WHEN _orders >= 5  THEN 3
          WHEN _orders >= 2  THEN 2
          ELSE 1 END;
  _m := CASE
          WHEN _spend >= 1000 THEN 5
          WHEN _spend >= 500  THEN 4
          WHEN _spend >= 200  THEN 3
          WHEN _spend >= 50   THEN 2
          ELSE 1 END;
  _tier := CASE
    WHEN _r >= 4 AND _f >= 4 AND _m >= 4 THEN 'Champion'
    WHEN _r >= 4 AND _f >= 3 THEN 'Loyal'
    WHEN _r >= 4 THEN 'New'
    WHEN _r = 3 THEN 'Promising'
    WHEN _r = 2 THEN 'At Risk'
    ELSE 'Lost'
  END;

  INSERT INTO public.diner_venue_stats AS s (
    diner_id, venue_id, lifetime_spend, lifetime_orders, avg_ticket,
    first_visit_at, last_visit_at, visit_count_90d, spend_last_30d,
    favourite_category_id, favourite_item_id, preferred_daypart,
    rfm_recency, rfm_frequency, rfm_monetary, rfm_tier,
    churn_risk_score, last_refreshed_at
  ) VALUES (
    _diner_id, _venue_id, _spend, _orders, _avg,
    _first, _last, _v90, _s30,
    _fav_cat, _fav_item, _daypart,
    _r, _f, _m, _tier,
    GREATEST(0, LEAST(100, 100 - (_r * 15 + _f * 5))), now()
  )
  ON CONFLICT (diner_id, venue_id) DO UPDATE SET
    lifetime_spend = EXCLUDED.lifetime_spend,
    lifetime_orders = EXCLUDED.lifetime_orders,
    avg_ticket = EXCLUDED.avg_ticket,
    first_visit_at = EXCLUDED.first_visit_at,
    last_visit_at = EXCLUDED.last_visit_at,
    visit_count_90d = EXCLUDED.visit_count_90d,
    spend_last_30d = EXCLUDED.spend_last_30d,
    favourite_category_id = EXCLUDED.favourite_category_id,
    favourite_item_id = EXCLUDED.favourite_item_id,
    preferred_daypart = EXCLUDED.preferred_daypart,
    rfm_recency = EXCLUDED.rfm_recency,
    rfm_frequency = EXCLUDED.rfm_frequency,
    rfm_monetary = EXCLUDED.rfm_monetary,
    rfm_tier = EXCLUDED.rfm_tier,
    churn_risk_score = EXCLUDED.churn_risk_score,
    last_refreshed_at = now(),
    updated_at = now();
END;
$$;

-- Trigger on diner_visits keeps stats fresh
CREATE OR REPLACE FUNCTION public.tg_refresh_diner_stats_from_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_diner_venue_stats(OLD.diner_id, OLD.venue_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_diner_venue_stats(NEW.diner_id, NEW.venue_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_refresh_diner_stats ON public.diner_visits;
CREATE TRIGGER trg_visits_refresh_diner_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.diner_visits
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_diner_stats_from_visit();
