
-- Create tax type enum
CREATE TYPE public.tax_type AS ENUM ('percent', 'fixed', 'compound_percent');

-- Create venue_taxes table
CREATE TABLE public.venue_taxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  tax_type public.tax_type NOT NULL DEFAULT 'percent',
  is_inclusive BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_taxes ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD
CREATE POLICY "Managers can view venue taxes"
ON public.venue_taxes FOR SELECT
TO authenticated
USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can insert venue taxes"
ON public.venue_taxes FOR INSERT
TO authenticated
WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update venue taxes"
ON public.venue_taxes FOR UPDATE
TO authenticated
USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete venue taxes"
ON public.venue_taxes FOR DELETE
TO authenticated
USING (is_venue_manager(auth.uid(), venue_id));

-- Staff can view
CREATE POLICY "Staff can view venue taxes"
ON public.venue_taxes FOR SELECT
TO authenticated
USING (is_venue_staff(auth.uid(), venue_id));

-- Admins can view all
CREATE POLICY "Admins can view all taxes"
ON public.venue_taxes FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- Public can view active taxes (needed for consumer checkout)
CREATE POLICY "Anyone can view active venue taxes"
ON public.venue_taxes FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Timestamp trigger
CREATE TRIGGER update_venue_taxes_updated_at
BEFORE UPDATE ON public.venue_taxes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
