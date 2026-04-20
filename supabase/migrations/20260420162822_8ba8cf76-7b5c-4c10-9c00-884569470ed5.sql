DROP POLICY IF EXISTS "Anyone can create a session" ON public.table_sessions;

CREATE POLICY "Anyone can create a session for a real table"
ON public.table_sessions FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tables t
    WHERE t.id = table_sessions.table_id
      AND t.venue_id = table_sessions.venue_id
  )
);
