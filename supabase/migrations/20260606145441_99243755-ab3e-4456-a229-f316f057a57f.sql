
-- ============================================================
-- PHASE 2: SEGMENTS
-- ============================================================

CREATE TYPE public.segment_kind AS ENUM ('static', 'dynamic', 'ai_lookalike');

CREATE TABLE public.diner_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kind public.segment_kind NOT NULL DEFAULT 'dynamic',
  -- JSONB DSL: { "logic": "AND"|"OR", "rules": [{ "field": "...", "op": "...", "val": ... }] }
  rules jsonb NOT NULL DEFAULT '{"logic":"AND","rules":[]}'::jsonb,
  member_count integer NOT NULL DEFAULT 0,
  last_refreshed_at timestamptz,
  ai_seed_segment_id uuid REFERENCES public.diner_segments(id) ON DELETE SET NULL,
  ai_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_diner_segments_venue ON public.diner_segments(venue_id) WHERE is_archived = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diner_segments TO authenticated;
GRANT ALL ON public.diner_segments TO service_role;
ALTER TABLE public.diner_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all segments" ON public.diner_segments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

CREATE POLICY "Managers manage own venue segments" ON public.diner_segments
  FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Staff view own venue segments" ON public.diner_segments
  FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE TRIGGER trg_diner_segments_updated
  BEFORE UPDATE ON public.diner_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.diner_segment_members (
  segment_id uuid NOT NULL REFERENCES public.diner_segments(id) ON DELETE CASCADE,
  diner_id uuid NOT NULL REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, diner_id)
);
CREATE INDEX idx_dsm_diner ON public.diner_segment_members(diner_id);
CREATE INDEX idx_dsm_venue ON public.diner_segment_members(venue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diner_segment_members TO authenticated;
GRANT ALL ON public.diner_segment_members TO service_role;
ALTER TABLE public.diner_segment_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all segment members" ON public.diner_segment_members
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

CREATE POLICY "Staff view own venue segment members" ON public.diner_segment_members
  FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers manage own venue segment members" ON public.diner_segment_members
  FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

-- ============================================================
-- SEGMENT EVALUATOR
-- Supports a small JSON DSL. Fields:
--   lifetime_spend, lifetime_orders, avg_ticket, visit_count_90d, spend_last_30d,
--   rfm_tier, days_since_last_visit, birthday_month, birthday_day,
--   has_email, has_sms, opt_in_email, opt_in_sms
-- Operators: =, !=, >, >=, <, <=, in, not_in, between
-- Special vals: "current_month", "current_day", "current_week"
-- ============================================================

CREATE OR REPLACE FUNCTION public.evaluate_diner_segment(_segment_id uuid)
RETURNS TABLE(diner_id uuid, venue_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seg RECORD;
  _logic text;
  _rules jsonb;
  _conds text[] := ARRAY[]::text[];
  _rule jsonb;
  _field text;
  _op text;
  _val jsonb;
  _sql_cond text;
  _val_text text;
  _sql text;
BEGIN
  SELECT * INTO _seg FROM public.diner_segments WHERE id = _segment_id;
  IF NOT FOUND THEN RETURN; END IF;

  _logic := COALESCE(_seg.rules->>'logic', 'AND');
  _rules := COALESCE(_seg.rules->'rules', '[]'::jsonb);

  FOR _rule IN SELECT jsonb_array_elements(_rules) LOOP
    _field := _rule->>'field';
    _op := COALESCE(_rule->>'op', '=');
    _val := _rule->'val';
    _sql_cond := NULL;

    -- Map field -> column expression (computed against dvs join dp)
    _sql_cond := CASE _field
      WHEN 'lifetime_spend' THEN 'dvs.lifetime_spend'
      WHEN 'lifetime_orders' THEN 'dvs.lifetime_orders'
      WHEN 'avg_ticket' THEN 'dvs.avg_ticket'
      WHEN 'visit_count_90d' THEN 'dvs.visit_count_90d'
      WHEN 'spend_last_30d' THEN 'dvs.spend_last_30d'
      WHEN 'rfm_tier' THEN 'dvs.rfm_tier'
      WHEN 'days_since_last_visit' THEN 'EXTRACT(DAY FROM now() - dvs.last_visit_at)::int'
      WHEN 'birthday_month' THEN 'dp.birthday_month'
      WHEN 'birthday_day' THEN 'dp.birthday_day'
      WHEN 'has_email' THEN '(dp.email IS NOT NULL)'
      WHEN 'has_sms' THEN '(dp.sms_e164 IS NOT NULL)'
      WHEN 'opt_in_email' THEN 'dp.marketing_opt_in_email'
      WHEN 'opt_in_sms' THEN 'dp.marketing_opt_in_sms'
      ELSE NULL
    END;

    IF _sql_cond IS NULL THEN CONTINUE; END IF;

    -- Resolve "current_*" tokens
    IF _val ? 0 IS NOT TRUE AND jsonb_typeof(_val) = 'string' THEN
      _val_text := _val#>>'{}';
      IF _val_text = 'current_month' THEN
        _val := to_jsonb(EXTRACT(MONTH FROM now())::int);
      ELSIF _val_text = 'current_day' THEN
        _val := to_jsonb(EXTRACT(DAY FROM now())::int);
      END IF;
    END IF;

    _sql_cond := CASE _op
      WHEN '='  THEN _sql_cond || ' = '  || quote_nullable(_val#>>'{}')
      WHEN '!=' THEN _sql_cond || ' <> ' || quote_nullable(_val#>>'{}')
      WHEN '>'  THEN _sql_cond || ' > '  || quote_nullable(_val#>>'{}')
      WHEN '>=' THEN _sql_cond || ' >= ' || quote_nullable(_val#>>'{}')
      WHEN '<'  THEN _sql_cond || ' < '  || quote_nullable(_val#>>'{}')
      WHEN '<=' THEN _sql_cond || ' <= ' || quote_nullable(_val#>>'{}')
      WHEN 'in' THEN _sql_cond || ' = ANY(ARRAY[' ||
        (SELECT string_agg(quote_literal(x#>>'{}'), ',') FROM jsonb_array_elements(_val) x) || '])'
      WHEN 'between' THEN _sql_cond || ' BETWEEN ' ||
        quote_nullable((_val->0)#>>'{}') || ' AND ' || quote_nullable((_val->1)#>>'{}')
      ELSE NULL
    END;

    IF _sql_cond IS NOT NULL THEN
      _conds := array_append(_conds, '(' || _sql_cond || ')');
    END IF;
  END LOOP;

  _sql := 'SELECT dp.id, dvs.venue_id FROM public.diner_venue_stats dvs '
       || 'JOIN public.diner_profiles dp ON dp.id = dvs.diner_id '
       || 'WHERE dvs.venue_id = ' || quote_literal(_seg.venue_id);

  IF array_length(_conds, 1) > 0 THEN
    _sql := _sql || ' AND (' || array_to_string(_conds, ' ' || _logic || ' ') || ')';
  END IF;

  RETURN QUERY EXECUTE _sql;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_diner_segment_members(_segment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seg RECORD;
  _count integer;
BEGIN
  SELECT * INTO _seg FROM public.diner_segments WHERE id = _segment_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF _seg.kind = 'static' THEN
    SELECT COUNT(*) INTO _count FROM public.diner_segment_members WHERE segment_id = _segment_id;
    UPDATE public.diner_segments
      SET member_count = _count, last_refreshed_at = now()
      WHERE id = _segment_id;
    RETURN _count;
  END IF;

  DELETE FROM public.diner_segment_members WHERE segment_id = _segment_id;

  INSERT INTO public.diner_segment_members (segment_id, diner_id, venue_id)
  SELECT _segment_id, diner_id, venue_id
  FROM public.evaluate_diner_segment(_segment_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _count = ROW_COUNT;

  UPDATE public.diner_segments
    SET member_count = _count, last_refreshed_at = now()
    WHERE id = _segment_id;

  RETURN _count;
END $$;

-- ============================================================
-- PHASE 3: CAMPAIGNS
-- ============================================================

CREATE TYPE public.campaign_channel AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed', 'cancelled');
CREATE TYPE public.campaign_goal AS ENUM ('daily_special', 'instant_special', 'win_back', 'birthday', 'kitchen_load', 'contest', 'announcement', 'custom');
CREATE TYPE public.campaign_send_status AS ENUM ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'suppressed');

CREATE TABLE public.crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel public.campaign_channel NOT NULL,
  goal public.campaign_goal NOT NULL DEFAULT 'custom',
  status public.campaign_status NOT NULL DEFAULT 'draft',
  segment_id uuid REFERENCES public.diner_segments(id) ON DELETE SET NULL,
  -- Content
  subject text,
  preheader text,
  body_html text,
  body_text text,
  sms_text text,
  push_title text,
  push_body text,
  cta_label text,
  cta_url text,
  -- AI metadata
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_instant boolean NOT NULL DEFAULT false,
  ai_prompt text,
  ai_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Scheduling
  scheduled_at timestamptz,
  send_started_at timestamptz,
  send_completed_at timestamptz,
  -- Counters (denorm)
  recipients_total integer NOT NULL DEFAULT 0,
  recipients_sent integer NOT NULL DEFAULT 0,
  recipients_delivered integer NOT NULL DEFAULT 0,
  recipients_opened integer NOT NULL DEFAULT 0,
  recipients_clicked integer NOT NULL DEFAULT 0,
  recipients_bounced integer NOT NULL DEFAULT 0,
  attributed_orders integer NOT NULL DEFAULT 0,
  attributed_revenue numeric(12,2) NOT NULL DEFAULT 0,
  -- Guardrails / approval
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_campaigns_venue_status ON public.crm_campaigns(venue_id, status);
CREATE INDEX idx_crm_campaigns_scheduled ON public.crm_campaigns(scheduled_at) WHERE status = 'scheduled';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaigns TO authenticated;
GRANT ALL ON public.crm_campaigns TO service_role;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all campaigns" ON public.crm_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

CREATE POLICY "Managers manage own venue campaigns" ON public.crm_campaigns
  FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Staff view own venue campaigns" ON public.crm_campaigns
  FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE TRIGGER trg_crm_campaigns_updated
  BEFORE UPDATE ON public.crm_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.crm_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  channel public.campaign_channel NOT NULL,
  recipient text NOT NULL,
  status public.campaign_send_status NOT NULL DEFAULT 'queued',
  provider_message_id text,
  tracking_token text UNIQUE,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ccs_campaign ON public.crm_campaign_sends(campaign_id);
CREATE INDEX idx_ccs_diner ON public.crm_campaign_sends(diner_id) WHERE diner_id IS NOT NULL;
CREATE INDEX idx_ccs_venue_sent ON public.crm_campaign_sends(venue_id, sent_at DESC) WHERE sent_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaign_sends TO authenticated;
GRANT ALL ON public.crm_campaign_sends TO service_role;
ALTER TABLE public.crm_campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all sends" ON public.crm_campaign_sends
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

CREATE POLICY "Staff view own venue sends" ON public.crm_campaign_sends
  FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Diners view own sends" ON public.crm_campaign_sends
  FOR SELECT TO authenticated
  USING (diner_id = public.get_user_diner_profile_id());

CREATE POLICY "Managers manage own venue sends" ON public.crm_campaign_sends
  FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER trg_ccs_updated
  BEFORE UPDATE ON public.crm_campaign_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Revenue attribution per order from a campaign click
CREATE TABLE public.crm_campaign_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  send_id uuid REFERENCES public.crm_campaign_sends(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  is_ai_generated boolean NOT NULL DEFAULT false,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, order_id)
);
CREATE INDEX idx_cca_venue_ai ON public.crm_campaign_attributions(venue_id, is_ai_generated, attributed_at DESC);
CREATE INDEX idx_cca_campaign ON public.crm_campaign_attributions(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaign_attributions TO authenticated;
GRANT ALL ON public.crm_campaign_attributions TO service_role;
ALTER TABLE public.crm_campaign_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all attributions" ON public.crm_campaign_attributions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

CREATE POLICY "Staff view own venue attributions" ON public.crm_campaign_attributions
  FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers manage own venue attributions" ON public.crm_campaign_attributions
  FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

-- Short opaque token used in campaign links to attribute click→order
CREATE TABLE public.crm_tracking_tokens (
  token text PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  send_id uuid REFERENCES public.crm_campaign_sends(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ctt_campaign ON public.crm_tracking_tokens(campaign_id);
CREATE INDEX idx_ctt_diner ON public.crm_tracking_tokens(diner_id) WHERE diner_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tracking_tokens TO authenticated;
GRANT ALL ON public.crm_tracking_tokens TO service_role;
ALTER TABLE public.crm_tracking_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all tokens" ON public.crm_tracking_tokens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

CREATE POLICY "Managers manage own venue tokens" ON public.crm_tracking_tokens
  FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Staff view own venue tokens" ON public.crm_tracking_tokens
  FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

-- Attribute an order to a campaign via tracking token (called server-side after checkout)
CREATE OR REPLACE FUNCTION public.attribute_order_to_campaign(_order_id uuid, _token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tok RECORD;
  _order RECORD;
  _camp RECORD;
  _attribution_id uuid;
BEGIN
  SELECT * INTO _tok FROM public.crm_tracking_tokens WHERE token = _token;
  IF NOT FOUND OR _tok.expires_at < now() THEN RETURN NULL; END IF;

  SELECT id, venue_id, total INTO _order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR _order.venue_id <> _tok.venue_id THEN RETURN NULL; END IF;

  SELECT id, is_ai_generated INTO _camp FROM public.crm_campaigns WHERE id = _tok.campaign_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.crm_campaign_attributions
    (campaign_id, send_id, order_id, venue_id, diner_id, revenue, is_ai_generated)
  VALUES
    (_tok.campaign_id, _tok.send_id, _order.id, _order.venue_id, _tok.diner_id,
     COALESCE(_order.total, 0), _camp.is_ai_generated)
  ON CONFLICT (campaign_id, order_id) DO UPDATE SET revenue = EXCLUDED.revenue
  RETURNING id INTO _attribution_id;

  UPDATE public.crm_campaigns
     SET attributed_orders = attributed_orders + 1,
         attributed_revenue = attributed_revenue + COALESCE(_order.total, 0)
     WHERE id = _tok.campaign_id;

  RETURN _attribution_id;
END $$;
