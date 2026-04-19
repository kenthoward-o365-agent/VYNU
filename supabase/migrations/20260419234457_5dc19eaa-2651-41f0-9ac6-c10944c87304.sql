-- Add is_active_display column
ALTER TABLE public.venue_order_statuses
ADD COLUMN IF NOT EXISTS is_active_display boolean NOT NULL DEFAULT false;

-- Backfill: mark received, preparing, ready as active display for all existing venues
UPDATE public.venue_order_statuses
SET is_active_display = true
WHERE name IN ('received', 'preparing', 'ready');

-- Update the seed function to include is_active_display in defaults
CREATE OR REPLACE FUNCTION public.seed_venue_order_statuses()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.venue_order_statuses (venue_id, name, label, description, color, display_order, is_terminal, is_default, is_active_display, maps_to_system_status) VALUES
    (NEW.id, 'received', 'Received', 'New order received from diner', '#3B82F6', 0, false, true, true, 'received'),
    (NEW.id, 'preparing', 'Preparing', 'Kitchen is preparing the order', '#F59E0B', 1, false, false, true, 'preparing'),
    (NEW.id, 'ready', 'Ready', 'Order is ready for pickup or delivery', '#10B981', 2, false, false, true, 'ready'),
    (NEW.id, 'served', 'Served', 'Order delivered to the diner', '#8B5CF6', 3, false, false, false, 'served'),
    (NEW.id, 'paid', 'Paid', 'Payment received', '#22C55E', 4, true, false, false, 'paid'),
    (NEW.id, 'cancelled', 'Cancelled', 'Order was cancelled', '#EF4444', 5, true, false, false, 'cancelled')
  ON CONFLICT (venue_id, name) DO NOTHING;
  RETURN NEW;
END;
$function$;