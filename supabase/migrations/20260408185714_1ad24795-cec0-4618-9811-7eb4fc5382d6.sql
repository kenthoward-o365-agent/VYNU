
DROP POLICY "Anyone can update chat sessions" ON public.chat_sessions;
CREATE POLICY "Anyone can update own chat sessions"
  ON public.chat_sessions FOR UPDATE TO anon, authenticated
  USING (venue_id IS NOT NULL);

DROP POLICY "Anyone can insert chat messages" ON public.chat_messages_log;
CREATE POLICY "Anyone can insert chat messages"
  ON public.chat_messages_log FOR INSERT TO anon, authenticated
  WITH CHECK (venue_id IS NOT NULL);
