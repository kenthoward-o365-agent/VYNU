DROP POLICY IF EXISTS "Anyone can update open sessions at table" ON public.table_sessions;

CREATE POLICY "Anyone can update open sessions at table"
ON public.table_sessions FOR UPDATE
TO anon, authenticated
USING (status IN ('open','firing'))
WITH CHECK (
  status IN ('open','firing','closed')
  AND venue_id = (SELECT venue_id FROM public.table_sessions WHERE id = table_sessions.id)
  AND table_id = (SELECT table_id FROM public.table_sessions WHERE id = table_sessions.id)
);
