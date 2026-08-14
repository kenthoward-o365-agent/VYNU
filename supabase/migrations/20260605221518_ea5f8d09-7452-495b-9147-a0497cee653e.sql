
-- 1) Revoke broad SELECT on venues from anon/authenticated, then re-grant only non-sensitive columns
REVOKE SELECT ON public.venues FROM anon;
REVOKE SELECT ON public.venues FROM authenticated;

GRANT SELECT (
  id, name, venue_type, address, city, state, postcode, country,
  logo_url, operating_hours, timezone, settings, is_active,
  created_at, updated_at, group_id, landing_page_html,
  site_id, menu_source, is_live, went_live_at
) ON public.venues TO anon;

GRANT SELECT (
  id, name, venue_type, address, city, state, postcode, country,
  logo_url, operating_hours, timezone, settings, is_active,
  created_at, updated_at, group_id, landing_page_html,
  site_id, menu_source, is_live, went_live_at
) ON public.venues TO authenticated;

-- Preserve write capability (RLS still gates the rows)
GRANT INSERT, UPDATE, DELETE ON public.venues TO authenticated;

-- 2) Drop the anon SELECT policy on chat_sessions to prevent diner_id enumeration
DROP POLICY IF EXISTS "Anon can read recent open sessions" ON public.chat_sessions;
