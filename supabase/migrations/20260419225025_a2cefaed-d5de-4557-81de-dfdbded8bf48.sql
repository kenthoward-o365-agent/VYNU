
-- Create venue_order_statuses table for customizable order status workflows per venue
CREATE TABLE public.venue_order_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  label text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3B82F6',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_terminal boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  maps_to_system_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

CREATE INDEX idx_venue_order_statuses_venue ON public.venue_order_statuses(venue_id, display_order);

ALTER TABLE public.venue_order_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view venue order statuses"
  ON public.venue_order_statuses FOR SELECT
  TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Public can view active venue order statuses"
  ON public.venue_order_statuses FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Managers can insert venue order statuses"
  ON public.venue_order_statuses FOR INSERT
  TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update venue order statuses"
  ON public.venue_order_statuses FOR UPDATE
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete venue order statuses"
  ON public.venue_order_statuses FOR DELETE
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER update_venue_order_statuses_updated_at
  BEFORE UPDATE ON public.venue_order_statuses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default statuses for all existing venues, mirroring the current hard-coded order_status enum
INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status)
SELECT v.id, 'received', 'Received', 'New order received from diner', '#3B82F6', 0, false, true, 'received' FROM public.venues v
ON CONFLICT (venue_id, name) DO NOTHING;

INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status)
SELECT v.id, 'preparing', 'Preparing', 'Kitchen is preparing the order', '#F59E0B', 1, false, false, 'preparing' FROM public.venues v
ON CONFLICT (venue_id, name) DO NOTHING;

INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status)
SELECT v.id, 'ready', 'Ready', 'Order is ready for pickup or delivery', '#10B981', 2, false, false, 'ready' FROM public.venues v
ON CONFLICT (venue_id, name) DO NOTHING;

INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status)
SELECT v.id, 'served', 'Served', 'Order delivered to the diner', '#8B5CF6', 3, false, false, 'served' FROM public.venues v
ON CONFLICT (venue_id, name) DO NOTHING;

INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status)
SELECT v.id, 'paid', 'Paid', 'Payment received', '#22C55E', 4, true, false, 'paid' FROM public.venues v
ON CONFLICT (venue_id, name) DO NOTHING;

INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status)
SELECT v.id, 'cancelled', 'Cancelled', 'Order was cancelled', '#EF4444', 5, true, false, 'cancelled' FROM public.venues v
ON CONFLICT (venue_id, name) DO NOTHING;

-- Auto-seed default statuses when a new venue is created
CREATE OR REPLACE FUNCTION public.seed_venue_order_statuses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, maps_to_system_status) VALUES
    (NEW.id, 'received', 'Received', 'New order received from diner', '#3B82F6', 0, false, true, 'received'),
    (NEW.id, 'preparing', 'Preparing', 'Kitchen is preparing the order', '#F59E0B', 1, false, false, 'preparing'),
    (NEW.id, 'ready', 'Ready', 'Order is ready for pickup or delivery', '#10B981', 2, false, false, 'ready'),
    (NEW.id, 'served', 'Served', 'Order delivered to the diner', '#8B5CF6', 3, false, false, 'served'),
    (NEW.id, 'paid', 'Paid', 'Payment received', '#22C55E', 4, true, false, 'paid'),
    (NEW.id, 'cancelled', 'Cancelled', 'Order was cancelled', '#EF4444', 5, true, false, 'cancelled')
  ON CONFLICT (venue_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_order_statuses_on_venue_insert
  AFTER INSERT ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_venue_order_statuses();
