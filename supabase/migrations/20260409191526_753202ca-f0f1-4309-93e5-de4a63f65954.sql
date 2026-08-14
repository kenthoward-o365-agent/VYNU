
-- Allow anon users to read chat_sessions they just created (needed for insert...select pattern)
CREATE POLICY "Anon can read chat sessions"
  ON public.chat_sessions FOR SELECT
  TO anon
  USING (true);

-- Allow anon users to read chat_messages_log (needed for insert...select pattern)  
CREATE POLICY "Anon can read chat messages"
  ON public.chat_messages_log FOR SELECT
  TO anon
  USING (true);

-- Allow anon users to insert chat messages
CREATE POLICY "Anon can insert chat messages"
  ON public.chat_messages_log FOR INSERT
  TO anon
  WITH CHECK (venue_id IS NOT NULL);
