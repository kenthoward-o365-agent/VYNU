
-- Audit date table
CREATE TABLE public.venue_audit_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  audit_date date NOT NULL DEFAULT CURRENT_DATE,
  advanced_by uuid,
  advanced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_audit_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view audit date"
  ON public.venue_audit_dates FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert audit date"
  ON public.venue_audit_dates FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update audit date"
  ON public.venue_audit_dates FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- Day-end log table
CREATE TABLE public.venue_dayend_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  audit_date date NOT NULL,
  closed_by uuid,
  closed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_dayend_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view dayend log"
  ON public.venue_dayend_log FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert dayend log"
  ON public.venue_dayend_log FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

-- Initialize audit date for a venue (upsert, returns the audit date)
CREATE OR REPLACE FUNCTION public.initialize_venue_audit_date(_venue_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _date date;
BEGIN
  IF NOT is_venue_staff(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO venue_audit_dates (venue_id, audit_date)
  VALUES (_venue_id, CURRENT_DATE)
  ON CONFLICT (venue_id) DO NOTHING;

  SELECT audit_date INTO _date FROM venue_audit_dates WHERE venue_id = _venue_id;
  RETURN _date;
END;
$$;

-- Advance audit date atomically
CREATE OR REPLACE FUNCTION public.advance_audit_date(_venue_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_date date;
  _new_date date;
BEGIN
  IF NOT is_venue_manager(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT audit_date INTO _old_date FROM venue_audit_dates WHERE venue_id = _venue_id FOR UPDATE;

  IF _old_date IS NULL THEN
    RAISE EXCEPTION 'Audit date not initialized for this venue';
  END IF;

  _new_date := _old_date + 1;

  INSERT INTO venue_dayend_log (venue_id, audit_date, closed_by)
  VALUES (_venue_id, _old_date, auth.uid());

  UPDATE venue_audit_dates
  SET audit_date = _new_date, advanced_by = auth.uid(), advanced_at = now()
  WHERE venue_id = _venue_id;

  RETURN _new_date;
END;
$$;
