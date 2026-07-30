GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_venue_staff(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_venue_manager(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, anon;