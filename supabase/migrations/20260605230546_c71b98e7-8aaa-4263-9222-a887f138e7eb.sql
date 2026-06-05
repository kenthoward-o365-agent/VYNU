
-- CoPilot conversations: one rolling thread per user per venue
CREATE TABLE public.copilot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_conversations TO authenticated;
GRANT ALL ON public.copilot_conversations TO service_role;

ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_conv_select_own"
  ON public.copilot_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "copilot_conv_insert_own"
  ON public.copilot_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "copilot_conv_update_own"
  ON public.copilot_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "copilot_conv_delete_own"
  ON public.copilot_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER copilot_conv_updated_at
  BEFORE UPDATE ON public.copilot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grant 'copilot' nav permission to existing owner/manager system roles
UPDATE public.venue_role_permissions vrp
SET nav_keys = (
  SELECT array_agg(DISTINCT k)
  FROM unnest(COALESCE(vrp.nav_keys, ARRAY[]::text[]) || ARRAY['copilot']) k
)
FROM public.venue_roles vr
WHERE vrp.role_id = vr.id
  AND vr.is_system = true
  AND lower(vr.name) IN ('owner', 'manager');
