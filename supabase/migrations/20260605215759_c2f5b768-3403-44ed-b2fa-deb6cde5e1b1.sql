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
    SELECT v.id
    FROM public.venues v
    WHERE v.name NOT ILIKE 'LOADTEST_%'
      AND (_q IS NULL OR v.name ILIKE '%' || _q || '%' OR COALESCE(v.city,'') ILIKE '%' || _q || '%' OR COALESCE(v.site_id,'') ILIKE '%' || _q || '%')
      AND (_status IS NULL OR _status = 'all' OR v.subscription_status = _status)
      AND (_venue_type IS NULL OR _venue_type = 'all' OR v.venue_type = _venue_type)
  )
  SELECT COUNT(*) INTO _total FROM filtered;

  WITH filtered AS (
    SELECT v.id, v.site_id, v.name, v.venue_type, v.city, v.state, v.is_active,
           v.subscription_status, v.subscription_plan, v.group_id, v.created_at
    FROM public.venues v
    WHERE v.name NOT ILIKE 'LOADTEST_%'
      AND (_q IS NULL OR v.name ILIKE '%' || _q || '%' OR COALESCE(v.city,'') ILIKE '%' || _q || '%' OR COALESCE(v.site_id,'') ILIKE '%' || _q || '%')
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