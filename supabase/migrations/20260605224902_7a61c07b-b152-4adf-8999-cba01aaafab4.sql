
-- chat_messages_log: tighten insert policies
DROP POLICY IF EXISTS "Anon can insert chat messages" ON public.chat_messages_log;
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages_log;

CREATE POLICY "Anon can insert user chat messages"
  ON public.chat_messages_log
  FOR INSERT
  TO anon
  WITH CHECK (
    venue_id IS NOT NULL
    AND role = 'user'
    AND EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages_log.session_id
        AND s.venue_id = chat_messages_log.venue_id
    )
  );

CREATE POLICY "Authenticated can insert user chat messages"
  ON public.chat_messages_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venue_id IS NOT NULL
    AND role = 'user'
    AND EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages_log.session_id
        AND s.venue_id = chat_messages_log.venue_id
    )
  );

COMMENT ON TABLE public.chat_messages_log IS
  'Client inserts are restricted to role=''user'' and must reference a chat_session at the same venue. Assistant/system messages must be inserted by edge functions using the service role.';

-- diner_web_sessions: scope insert ownership + allow owner updates
DROP POLICY IF EXISTS "Anyone can start a web session" ON public.diner_web_sessions;

CREATE POLICY "Anon can start a web session"
  ON public.diner_web_sessions
  FOR INSERT
  TO anon
  WITH CHECK (venue_id IS NOT NULL AND diner_id IS NULL);

CREATE POLICY "Authenticated can start a web session"
  ON public.diner_web_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venue_id IS NOT NULL
    AND (diner_id IS NULL OR diner_id = public.get_user_diner_profile_id())
  );

CREATE POLICY "Owners can update their web session"
  ON public.diner_web_sessions
  FOR UPDATE
  TO authenticated
  USING (diner_id IS NOT NULL AND diner_id = public.get_user_diner_profile_id())
  WITH CHECK (diner_id IS NOT NULL AND diner_id = public.get_user_diner_profile_id());
