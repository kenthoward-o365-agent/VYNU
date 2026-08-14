
DROP POLICY IF EXISTS "Anyone can create chat sessions" ON public.chat_sessions;
CREATE POLICY "Anyone can create chat sessions"
ON public.chat_sessions
FOR INSERT
WITH CHECK (
  venue_id IS NOT NULL
  AND (diner_id IS NULL OR diner_id = public.get_user_diner_profile_id())
);

DROP POLICY IF EXISTS "Anyone can create a limited session for a real table" ON public.table_sessions;
CREATE POLICY "Anyone can create a limited session for a real table"
ON public.table_sessions
FOR INSERT
WITH CHECK (
  status = 'open'
  AND public.can_create_table_session(venue_id, table_id)
  AND (host_diner_id IS NULL OR host_diner_id = public.get_user_diner_profile_id())
);
