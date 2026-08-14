-- Role-check helpers: only usable inside RLS policies / SECURITY DEFINER functions
-- and by trusted server-side (service_role) code. Not directly callable by clients.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_venue_staff(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_venue_manager(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_venue_staff(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_venue_manager(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO service_role;

-- Internal helpers, invoked by other SECURITY DEFINER functions / triggers only.
REVOKE EXECUTE ON FUNCTION public.can_create_table_session(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_diner_venue_stats(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_table_session(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_diner_venue_stats(uuid, uuid) TO service_role;