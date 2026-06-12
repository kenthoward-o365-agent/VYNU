
CREATE OR REPLACE FUNCTION public.list_sibling_venues(_group_id uuid, _exclude_venue_id uuid)
RETURNS TABLE(id uuid, name text, venue_type text, address text, city text, logo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.name, v.venue_type, v.address, v.city, v.logo_url
  FROM public.venues v
  WHERE v.group_id = _group_id
    AND v.is_active = true
    AND v.id <> _exclude_venue_id
  ORDER BY v.name;
$$;

REVOKE ALL ON FUNCTION public.list_sibling_venues(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sibling_venues(uuid, uuid) TO anon, authenticated, service_role;
