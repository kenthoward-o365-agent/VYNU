-- Close current scanner findings from broad public/table access.

-- 1) api_webhooks.secret: keep the raw signing secret service-only at column level.
REVOKE SELECT (secret) ON public.api_webhooks FROM PUBLIC, anon, authenticated;

-- Keep the safe admin listing callable by signed-in admins only.
REVOKE ALL ON FUNCTION public.list_api_webhooks_safe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_api_webhooks_safe() TO authenticated;

-- 2) crm_suppression: global suppressions are admin-only; managers see only their venue rows.
DROP POLICY IF EXISTS "Managers view suppression for their venue" ON public.crm_suppression;
CREATE POLICY "Managers view suppression for their venue"
ON public.crm_suppression
FOR SELECT
TO authenticated
USING (
  venue_id IS NOT NULL
  AND public.is_venue_manager(auth.uid(), venue_id)
);

DROP POLICY IF EXISTS "Admins view all suppression" ON public.crm_suppression;
CREATE POLICY "Admins view all suppression"
ON public.crm_suppression
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'::public.app_role));

-- 3) table_sessions: remove broad anonymous reads. Consumers use list_open_sessions_at_table(_venue_id, _table_id).
DROP POLICY IF EXISTS "Anon can read recent open sessions" ON public.table_sessions;
REVOKE SELECT (host_diner_id, fired_by) ON public.table_sessions FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.list_open_sessions_at_table(
  _venue_id uuid,
  _table_id uuid
)
RETURNS TABLE(
  id uuid,
  display_name text,
  diner_count integer,
  opened_at timestamp with time zone,
  fire_strategy text,
  host_first_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    ts.id,
    ts.display_name,
    ts.diner_count,
    ts.opened_at,
    ts.fire_strategy,
    dp.first_name AS host_first_name
  FROM public.table_sessions ts
  LEFT JOIN public.diner_profiles dp ON dp.id = ts.host_diner_id
  WHERE ts.venue_id = _venue_id
    AND ts.table_id = _table_id
    AND ts.status = 'open'
    AND ts.is_discoverable = true
    AND ts.auto_close_at > now()
  ORDER BY ts.opened_at ASC;
$$;
REVOKE ALL ON FUNCTION public.list_open_sessions_at_table(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_sessions_at_table(uuid, uuid) TO anon, authenticated;

-- 4) venue_display_areas: remove direct anonymous access to internal operational config.
DROP POLICY IF EXISTS "Public can view active display areas" ON public.venue_display_areas;
REVOKE SELECT ON public.venue_display_areas FROM anon;

-- 5) venue_order_statuses: remove direct anonymous access to internal workflows.
DROP POLICY IF EXISTS "Public can view active venue order statuses" ON public.venue_order_statuses;
REVOKE SELECT ON public.venue_order_statuses FROM anon;

-- 6) venue_taxes: remove broad public all-venue reads; expose only a venue-scoped safe helper.
DROP POLICY IF EXISTS "Anyone can view active venue taxes" ON public.venue_taxes;
REVOKE SELECT ON public.venue_taxes FROM anon;

CREATE OR REPLACE FUNCTION public.get_venue_taxes_public(_venue_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  rate numeric,
  tax_type text,
  is_inclusive boolean,
  display_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT vt.id, vt.name, vt.rate, vt.tax_type, vt.is_inclusive, vt.display_order
  FROM public.venue_taxes vt
  WHERE vt.venue_id = _venue_id
    AND vt.is_active = true
  ORDER BY vt.display_order;
$$;
REVOKE ALL ON FUNCTION public.get_venue_taxes_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_taxes_public(uuid) TO anon, authenticated;

-- Authenticated venue staff/manager access stays governed by the existing venue-scoped policies.