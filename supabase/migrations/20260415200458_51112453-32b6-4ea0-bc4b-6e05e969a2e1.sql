
-- Add menu_source to venues
ALTER TABLE public.venues
  ADD COLUMN menu_source text NOT NULL DEFAULT 'manual';

-- Add pos_id to menu_items and menu_categories
ALTER TABLE public.menu_items ADD COLUMN pos_id text;
ALTER TABLE public.menu_categories ADD COLUMN pos_id text;

-- Create venue_pos_integrations table
CREATE TABLE public.venue_pos_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  pos_provider text NOT NULL,
  api_key_ref text,
  endpoint_url text,
  last_sync_at timestamptz,
  sync_status text NOT NULL DEFAULT 'idle',
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_pos_integrations_venue_id_key UNIQUE (venue_id)
);

-- Enable RLS
ALTER TABLE public.venue_pos_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can view pos integrations"
  ON public.venue_pos_integrations FOR SELECT
  TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert pos integrations"
  ON public.venue_pos_integrations FOR INSERT
  TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update pos integrations"
  ON public.venue_pos_integrations FOR UPDATE
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete pos integrations"
  ON public.venue_pos_integrations FOR DELETE
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Admins can view all pos integrations"
  ON public.venue_pos_integrations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can manage pos integrations"
  ON public.venue_pos_integrations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_venue_pos_integrations_updated_at
  BEFORE UPDATE ON public.venue_pos_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
