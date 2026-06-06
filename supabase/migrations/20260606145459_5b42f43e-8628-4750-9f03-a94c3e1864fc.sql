
REVOKE EXECUTE ON FUNCTION public.evaluate_diner_segment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_diner_segment_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.attribute_order_to_campaign(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_diner_segment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_diner_segment_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attribute_order_to_campaign(uuid, text) TO service_role;
