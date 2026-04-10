
-- Create menu_time_frames table
CREATE TABLE public.menu_time_frames (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::integer[],
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_time_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view time frames" ON public.menu_time_frames
  FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert time frames" ON public.menu_time_frames
  FOR INSERT TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update time frames" ON public.menu_time_frames
  FOR UPDATE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete time frames" ON public.menu_time_frames
  FOR DELETE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER update_menu_time_frames_updated_at
  BEFORE UPDATE ON public.menu_time_frames
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create menu_item_time_frames junction table
CREATE TABLE public.menu_item_time_frames (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  time_frame_id uuid NOT NULL REFERENCES public.menu_time_frames(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, time_frame_id)
);

ALTER TABLE public.menu_item_time_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view item time frames" ON public.menu_item_time_frames
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_time_frames.menu_item_id
    AND is_venue_staff(auth.uid(), mi.venue_id)
  ));

CREATE POLICY "Managers can insert item time frames" ON public.menu_item_time_frames
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_time_frames.menu_item_id
    AND is_venue_manager(auth.uid(), mi.venue_id)
  ));

CREATE POLICY "Managers can delete item time frames" ON public.menu_item_time_frames
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_time_frames.menu_item_id
    AND is_venue_manager(auth.uid(), mi.venue_id)
  ));

-- Add modifier_type and modifier_value to pricing_rules
ALTER TABLE public.pricing_rules
  ADD COLUMN modifier_type text NOT NULL DEFAULT 'percent',
  ADD COLUMN modifier_value numeric NOT NULL DEFAULT 0;

-- Backfill existing rules: copy modifier_percent into modifier_value
UPDATE public.pricing_rules SET modifier_value = modifier_percent WHERE modifier_percent != 0;
