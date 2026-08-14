
-- Create pricing_rule_types table
CREATE TABLE public.pricing_rule_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, name)
);

-- Enable RLS
ALTER TABLE public.pricing_rule_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can view rule types"
  ON public.pricing_rule_types FOR SELECT
  TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert rule types"
  ON public.pricing_rule_types FOR INSERT
  TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update rule types"
  ON public.pricing_rule_types FOR UPDATE
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete rule types"
  ON public.pricing_rule_types FOR DELETE
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

-- Timestamp trigger
CREATE TRIGGER update_pricing_rule_types_updated_at
  BEFORE UPDATE ON public.pricing_rule_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Convert pricing_rules.rule_type from enum to text
ALTER TABLE public.pricing_rules
  ALTER COLUMN rule_type TYPE text USING rule_type::text;

-- Drop the enum type (no longer needed)
DROP TYPE IF EXISTS public.pricing_rule_type;

-- Seed default rule types for every existing venue
INSERT INTO public.pricing_rule_types (venue_id, name, label, display_order)
SELECT v.id, t.name, t.label, t.display_order
FROM public.venues v
CROSS JOIN (VALUES
  ('happy_hour', 'Happy Hour', 0),
  ('late_night', 'Late Night', 1),
  ('special', 'Special', 2),
  ('event', 'Event', 3),
  ('weather', 'Weather', 4)
) AS t(name, label, display_order);
