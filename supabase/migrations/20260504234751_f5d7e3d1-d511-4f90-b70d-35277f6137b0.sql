CREATE OR REPLACE FUNCTION public.get_diner_order_status(_order_id uuid)
RETURNS TABLE (
  id uuid,
  status text,
  total numeric,
  created_at timestamptz,
  extra_wait_minutes integer,
  throttled_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.status::text, o.total, o.created_at,
         o.extra_wait_minutes, o.throttled_until
  FROM public.orders o
  WHERE o.id = _order_id;
$$;

REVOKE ALL ON FUNCTION public.get_diner_order_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_diner_order_status(uuid) TO anon, authenticated;