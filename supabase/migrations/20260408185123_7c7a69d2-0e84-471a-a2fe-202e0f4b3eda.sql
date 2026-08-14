
-- Add venue context to ai config
ALTER TABLE public.venue_ai_config
ADD COLUMN venue_context text DEFAULT '';

-- Create alert type enum
CREATE TYPE public.alert_type AS ENUM ('manager_request', 'assistance', 'complaint');

-- Create alert status enum
CREATE TYPE public.alert_status AS ENUM ('pending', 'acknowledged', 'resolved');

-- Create staff alerts table
CREATE TABLE public.staff_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL,
  diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  alert_type public.alert_type NOT NULL DEFAULT 'manager_request',
  message text,
  status public.alert_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

ALTER TABLE public.staff_alerts ENABLE ROW LEVEL SECURITY;

-- Anyone can create alerts (diners from consumer app)
CREATE POLICY "Anyone can create alerts"
  ON public.staff_alerts FOR INSERT TO anon, authenticated
  WITH CHECK (venue_id IS NOT NULL);

-- Staff can view alerts for their venue
CREATE POLICY "Staff can view alerts"
  ON public.staff_alerts FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

-- Staff can update alerts (acknowledge/resolve)
CREATE POLICY "Staff can update alerts"
  ON public.staff_alerts FOR UPDATE TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_alerts;
