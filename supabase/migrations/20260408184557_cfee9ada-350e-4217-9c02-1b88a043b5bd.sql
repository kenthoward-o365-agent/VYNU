
CREATE TABLE public.venue_ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  agent_name text NOT NULL DEFAULT 'Sippa',
  agent_icon_url text,
  opening_message text DEFAULT 'Hey! 👋 I''m your AI server. Tell me what you''re in the mood for and I''ll find the perfect dish.',
  tone text NOT NULL DEFAULT 'aussie',
  chat_mode text NOT NULL DEFAULT 'chat_optional',
  personality_extras jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_ai_config ENABLE ROW LEVEL SECURITY;

-- Managers can do everything
CREATE POLICY "Managers can view ai config"
  ON public.venue_ai_config FOR SELECT TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can insert ai config"
  ON public.venue_ai_config FOR INSERT TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update ai config"
  ON public.venue_ai_config FOR UPDATE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete ai config"
  ON public.venue_ai_config FOR DELETE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

-- Staff can view
CREATE POLICY "Staff can view ai config"
  ON public.venue_ai_config FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

-- Public can view (consumer app needs this)
CREATE POLICY "Public can view ai config"
  ON public.venue_ai_config FOR SELECT TO anon
  USING (true);

-- Authenticated users can also view any config (for consumer ordering)
CREATE POLICY "Authenticated can view ai config"
  ON public.venue_ai_config FOR SELECT TO authenticated
  USING (true);

-- Timestamp trigger
CREATE TRIGGER update_venue_ai_config_updated_at
  BEFORE UPDATE ON public.venue_ai_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
