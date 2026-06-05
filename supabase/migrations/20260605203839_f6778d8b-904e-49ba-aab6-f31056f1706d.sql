
-- 1. ar_dunning_schedules: drop broad authenticated read
DROP POLICY IF EXISTS "Authenticated users can read dunning schedules" ON public.ar_dunning_schedules;

-- 2. chat_sessions: remove diner_id IS NULL fallback
DROP POLICY IF EXISTS "Authenticated diners can read own chat sessions" ON public.chat_sessions;
CREATE POLICY "Authenticated diners can read own chat sessions"
ON public.chat_sessions FOR SELECT TO authenticated
USING (diner_id = public.get_user_diner_profile_id());

-- 3. loyalty_programs: drop broad authenticated active read
DROP POLICY IF EXISTS "Authenticated users can view active loyalty programs" ON public.loyalty_programs;
DROP POLICY IF EXISTS "Public can view active loyalty programs" ON public.loyalty_programs;

CREATE OR REPLACE FUNCTION public.get_active_loyalty_programs_for_venue(_venue_id uuid)
RETURNS TABLE(id uuid, name text, program_type loyalty_program_type, venue_id uuid, group_id uuid, rules jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lp.id, lp.name, lp.program_type, lp.venue_id, lp.group_id, lp.rules
  FROM public.loyalty_programs lp
  LEFT JOIN public.venues v ON v.id = _venue_id
  WHERE lp.is_active = true
    AND (
      lp.venue_id = _venue_id
      OR (lp.group_id IS NOT NULL AND lp.group_id = v.group_id)
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_active_loyalty_programs_for_venue(uuid) TO anon, authenticated;

-- 4. pos_sync_log: replace authenticated insert with service_role
DROP POLICY IF EXISTS "Service can insert sync logs" ON public.pos_sync_log;
CREATE POLICY "Service role can insert sync logs"
ON public.pos_sync_log FOR INSERT TO service_role
WITH CHECK (true);

-- 5. venue_ai_config: drop broad reads
DROP POLICY IF EXISTS "Authenticated can view ai config" ON public.venue_ai_config;
DROP POLICY IF EXISTS "Public can view ai config" ON public.venue_ai_config;

CREATE OR REPLACE FUNCTION public.get_venue_ai_config_public(_venue_id uuid)
RETURNS TABLE(agent_name text, agent_icon_url text, opening_message text, tone text, chat_mode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.agent_name, c.agent_icon_url, c.opening_message, c.tone, c.chat_mode
  FROM public.venue_ai_config c
  JOIN public.venues v ON v.id = c.venue_id
  WHERE c.venue_id = _venue_id AND v.is_active = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_venue_ai_config_public(uuid) TO anon, authenticated;

-- 6. venues: revoke sensitive columns from anon/authenticated; add admin RPC
REVOKE SELECT (email, phone, subscription_plan, subscription_status, subscription_notes)
  ON public.venues FROM anon;
REVOKE SELECT (email, phone, subscription_plan, subscription_status, subscription_notes)
  ON public.venues FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_venue_admin_detail(_venue_id uuid)
RETURNS TABLE(
  email text, phone text,
  subscription_plan text, subscription_status text, subscription_notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_staff(auth.uid(), _venue_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT v.email, v.phone,
           v.subscription_plan::text, v.subscription_status::text, v.subscription_notes
    FROM public.venues v
    WHERE v.id = _venue_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_venue_admin_detail(uuid) TO authenticated;
