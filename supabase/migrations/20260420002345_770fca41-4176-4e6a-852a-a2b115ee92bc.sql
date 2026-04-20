-- Add per-user order action permissions to venue_staff
ALTER TABLE public.venue_staff
  ADD COLUMN IF NOT EXISTS can_update_order_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_reopen_closed_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_process_refunds boolean NOT NULL DEFAULT false;

-- Backfill from existing legacy enum role
UPDATE public.venue_staff
SET can_update_order_status = true,
    can_reopen_closed_orders = true,
    can_process_refunds = true
WHERE role IN ('owner', 'manager');

UPDATE public.venue_staff
SET can_update_order_status = true
WHERE role = 'staff';
