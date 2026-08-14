ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS default_service_mode text NOT NULL DEFAULT 'table_delivery',
  ADD COLUMN IF NOT EXISTS default_pickup_location text,
  ADD COLUMN IF NOT EXISTS default_payment_timing text NOT NULL DEFAULT 'at_order';

ALTER TABLE public.venues
  DROP CONSTRAINT IF EXISTS venues_default_service_mode_check,
  DROP CONSTRAINT IF EXISTS venues_default_payment_timing_check;
ALTER TABLE public.venues
  ADD CONSTRAINT venues_default_service_mode_check CHECK (default_service_mode IN ('table_delivery','counter_pickup')),
  ADD CONSTRAINT venues_default_payment_timing_check CHECK (default_payment_timing IN ('at_order','at_end'));

ALTER TABLE public.venue_zones
  ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'inherit',
  ADD COLUMN IF NOT EXISTS pickup_location_label text,
  ADD COLUMN IF NOT EXISTS notify_sms_on_ready boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_inapp_on_ready boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.venue_zones DROP CONSTRAINT IF EXISTS venue_zones_service_mode_check;
ALTER TABLE public.venue_zones
  ADD CONSTRAINT venue_zones_service_mode_check CHECK (service_mode IN ('inherit','table_delivery','counter_pickup'));

UPDATE public.venue_zones SET payment_override = true WHERE tabs_enabled = true AND payment_override = false;

CREATE OR REPLACE FUNCTION public.get_table_tab_rules(_venue_id uuid, _table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _zone_id uuid;
  _rules public.venue_zones%ROWTYPE;
  _open_tab uuid;
  _v_service text;
  _v_pickup text;
  _v_timing text;
  _service text;
  _pickup text;
  _tabs boolean;
BEGIN
  SELECT COALESCE(default_service_mode,'table_delivery'), default_pickup_location, COALESCE(default_payment_timing,'at_order')
    INTO _v_service, _v_pickup, _v_timing
    FROM public.venues WHERE id = _venue_id;

  SELECT zone_id INTO _zone_id FROM public.tables WHERE id = _table_id AND venue_id = _venue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tabs_enabled', false);
  END IF;

  IF _zone_id IS NOT NULL THEN
    SELECT * INTO _rules FROM public.venue_zones WHERE id = _zone_id;
  END IF;

  SELECT id INTO _open_tab FROM public.table_tabs
   WHERE table_id = _table_id AND venue_id = _venue_id AND status = 'open'
   ORDER BY created_at DESC LIMIT 1;

  _service := CASE
    WHEN _rules.service_mode IS NULL OR _rules.service_mode = 'inherit' THEN COALESCE(_v_service,'table_delivery')
    ELSE _rules.service_mode END;
  _pickup := COALESCE(NULLIF(_rules.pickup_location_label,''), NULLIF(_v_pickup,''));
  _tabs := CASE
    WHEN COALESCE(_rules.payment_override,false) THEN COALESCE(_rules.tabs_enabled,false)
    ELSE (COALESCE(_v_timing,'at_order') = 'at_end') END;

  RETURN jsonb_build_object(
    'zone', _rules.name,
    'zone_id', _zone_id,
    'tabs_enabled', _tabs,
    'payment_override', COALESCE(_rules.payment_override,false),
    'venue_payment_timing', COALESCE(_v_timing,'at_order'),
    'service_mode', _service,
    'pickup_location', _pickup,
    'notify_sms_on_ready', COALESCE(_rules.notify_sms_on_ready, true),
    'notify_inapp_on_ready', COALESCE(_rules.notify_inapp_on_ready, true),
    'require_preauth', COALESCE(_rules.require_preauth, false),
    'preauth_amount', _rules.preauth_amount,
    'max_tab_amount', _rules.max_tab_amount,
    'allow_split_payments', COALESCE(_rules.allow_split_payments, true),
    'open_tab_id', _open_tab
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.get_diner_order_status(uuid);
CREATE OR REPLACE FUNCTION public.get_diner_order_status(_order_id uuid)
 RETURNS TABLE(id uuid, status text, total numeric, created_at timestamp with time zone, extra_wait_minutes integer, throttled_until timestamp with time zone, service_mode text, pickup_location text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.status::text, o.total, o.created_at,
         o.extra_wait_minutes, o.throttled_until,
         CASE
           WHEN z.service_mode IS NULL OR z.service_mode = 'inherit'
             THEN COALESCE(v.default_service_mode, 'table_delivery')
           ELSE z.service_mode
         END AS service_mode,
         COALESCE(NULLIF(z.pickup_location_label, ''), NULLIF(v.default_pickup_location, '')) AS pickup_location
  FROM public.orders o
  JOIN public.venues v ON v.id = o.venue_id
  LEFT JOIN public.tables t ON t.id = o.table_id
  LEFT JOIN public.venue_zones z ON z.id = t.zone_id
  WHERE o.id = _order_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_diner_order_status(uuid) TO anon, authenticated, service_role;