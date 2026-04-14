-- Allow anon to read back the session they just inserted (needed for .select("id").single())
CREATE POLICY "Anon can read open sessions"
  ON public.chat_sessions FOR SELECT TO anon
  USING (ended_at IS NULL);