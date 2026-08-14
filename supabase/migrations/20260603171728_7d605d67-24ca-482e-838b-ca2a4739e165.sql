
-- Onboarding state per venue
CREATE TABLE public.venue_onboarding_state (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  pos_choice text,
  pos_vendor text,
  readiness_snapshot jsonb,
  first_dayend_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.venue_onboarding_state TO authenticated;
GRANT ALL ON public.venue_onboarding_state TO service_role;
ALTER TABLE public.venue_onboarding_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage own venue onboarding"
  ON public.venue_onboarding_state
  FOR ALL
  TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER trg_venue_onboarding_state_updated
  BEFORE UPDATE ON public.venue_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Onboarding chat messages
CREATE TABLE public.onboarding_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL,
  parts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_onboarding_chat_messages_venue ON public.onboarding_chat_messages(venue_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.onboarding_chat_messages TO authenticated;
GRANT ALL ON public.onboarding_chat_messages TO service_role;
ALTER TABLE public.onboarding_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read venue onboarding chat"
  ON public.onboarding_chat_messages
  FOR SELECT
  TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers write venue onboarding chat"
  ON public.onboarding_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers clear venue onboarding chat"
  ON public.onboarding_chat_messages
  FOR DELETE
  TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- Onboarding test runs
CREATE TABLE public.onboarding_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  steps jsonb NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_onboarding_test_runs_venue ON public.onboarding_test_runs(venue_id, ran_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_test_runs TO authenticated;
GRANT ALL ON public.onboarding_test_runs TO service_role;
ALTER TABLE public.onboarding_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage own venue test runs"
  ON public.onboarding_test_runs
  FOR ALL
  TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

-- Add is_live flag to venues for the go-live gate
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS went_live_at timestamptz;
