-- Add gratuity_amount and audit_date columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gratuity_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_date date;

-- Backfill audit_date for existing rows
UPDATE public.orders
SET audit_date = (created_at AT TIME ZONE 'UTC')::date
WHERE audit_date IS NULL;

-- Index for reporting queries
CREATE INDEX IF NOT EXISTS idx_orders_venue_audit_date
  ON public.orders (venue_id, audit_date);

-- Public RPC for anon checkout to read current audit date
CREATE OR REPLACE FUNCTION public.get_venue_audit_date(_venue_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _date date;
BEGIN
  SELECT audit_date INTO _date
  FROM venue_audit_dates
  WHERE venue_id = _venue_id;

  -- Fallback: if not initialized, return today
  IF _date IS NULL THEN
    _date := CURRENT_DATE;
  END IF;

  RETURN _date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_audit_date(uuid) TO anon, authenticated;