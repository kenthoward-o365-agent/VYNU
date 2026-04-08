
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL,
  message_count integer NOT NULL DEFAULT 0,
  items_added integer NOT NULL DEFAULT 0,
  converted_to_order boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create chat sessions"
  ON public.chat_sessions FOR INSERT TO anon, authenticated
  WITH CHECK (venue_id IS NOT NULL);

CREATE POLICY "Anyone can update chat sessions"
  ON public.chat_sessions FOR UPDATE TO anon, authenticated
  USING (true);

CREATE POLICY "Staff can view chat sessions"
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE TABLE public.chat_messages_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  had_items_added boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert chat messages"
  ON public.chat_messages_log FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Staff can view chat messages"
  ON public.chat_messages_log FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE INDEX idx_chat_sessions_venue ON public.chat_sessions(venue_id);
CREATE INDEX idx_chat_sessions_started ON public.chat_sessions(started_at);
CREATE INDEX idx_chat_messages_session ON public.chat_messages_log(session_id);
CREATE INDEX idx_chat_messages_venue ON public.chat_messages_log(venue_id);
