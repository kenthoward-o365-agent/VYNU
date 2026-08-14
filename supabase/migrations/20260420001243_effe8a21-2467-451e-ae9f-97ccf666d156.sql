
-- Display Terminals: physical devices bound to one or more Display Areas
CREATE TABLE public.display_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  device_token uuid UNIQUE,
  pairing_code text,
  pairing_code_expires_at timestamptz,
  paired_at timestamptz,
  paired_by uuid,
  last_seen_at timestamptz,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

CREATE INDEX idx_display_terminals_venue ON public.display_terminals(venue_id);
CREATE INDEX idx_display_terminals_token ON public.display_terminals(device_token) WHERE device_token IS NOT NULL;
CREATE INDEX idx_display_terminals_pairing_code ON public.display_terminals(pairing_code) WHERE pairing_code IS NOT NULL;

ALTER TABLE public.display_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view venue terminals"
  ON public.display_terminals FOR SELECT
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can create terminals"
  ON public.display_terminals FOR INSERT
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update terminals"
  ON public.display_terminals FOR UPDATE
  USING (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete terminals"
  ON public.display_terminals FOR DELETE
  USING (public.is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER update_display_terminals_updated_at
  BEFORE UPDATE ON public.display_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Junction: terminal -> display areas
CREATE TABLE public.display_terminal_areas (
  terminal_id uuid NOT NULL REFERENCES public.display_terminals(id) ON DELETE CASCADE,
  display_area_id uuid NOT NULL REFERENCES public.venue_display_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (terminal_id, display_area_id)
);

CREATE INDEX idx_display_terminal_areas_area ON public.display_terminal_areas(display_area_id);

ALTER TABLE public.display_terminal_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view terminal areas"
  ON public.display_terminal_areas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.display_terminals t
    WHERE t.id = terminal_id AND public.is_venue_staff(auth.uid(), t.venue_id)
  ));

CREATE POLICY "Managers can write terminal areas"
  ON public.display_terminal_areas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.display_terminals t
    WHERE t.id = terminal_id AND public.is_venue_manager(auth.uid(), t.venue_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.display_terminals t
    WHERE t.id = terminal_id AND public.is_venue_manager(auth.uid(), t.venue_id)
  ));

-- Pair a terminal: exchange a pairing code for a device token
CREATE OR REPLACE FUNCTION public.pair_display_terminal(_code text, _user_agent text DEFAULT NULL)
RETURNS TABLE (terminal_id uuid, device_token uuid, terminal_name text, area_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _terminal RECORD;
  _new_token uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _terminal
  FROM public.display_terminals
  WHERE pairing_code = upper(trim(_code))
    AND pairing_code_expires_at > now()
    AND device_token IS NULL
    AND is_active = true
  LIMIT 1;

  IF _terminal.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired pairing code';
  END IF;

  IF NOT public.is_venue_staff(auth.uid(), _terminal.venue_id) THEN
    RAISE EXCEPTION 'Not authorised for this venue';
  END IF;

  _new_token := gen_random_uuid();

  UPDATE public.display_terminals
  SET device_token = _new_token,
      paired_at = now(),
      paired_by = auth.uid(),
      last_seen_at = now(),
      user_agent = _user_agent,
      pairing_code = NULL,
      pairing_code_expires_at = NULL
  WHERE id = _terminal.id;

  RETURN QUERY
  SELECT _terminal.id, _new_token, _terminal.name,
         COALESCE(array_agg(dta.display_area_id) FILTER (WHERE dta.display_area_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.display_terminals t
  LEFT JOIN public.display_terminal_areas dta ON dta.terminal_id = t.id
  WHERE t.id = _terminal.id
  GROUP BY t.id;
END;
$$;

-- Heartbeat: terminal pings while open
CREATE OR REPLACE FUNCTION public.heartbeat_display_terminal(_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.display_terminals
  SET last_seen_at = now()
  WHERE device_token = _token AND is_active = true;
  RETURN FOUND;
END;
$$;

-- Lookup terminal by its token (used by the Orders page on load)
CREATE OR REPLACE FUNCTION public.get_terminal_by_token(_token uuid)
RETURNS TABLE (terminal_id uuid, venue_id uuid, terminal_name text, is_active boolean, area_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.venue_id, t.name, t.is_active,
         COALESCE(array_agg(dta.display_area_id) FILTER (WHERE dta.display_area_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.display_terminals t
  LEFT JOIN public.display_terminal_areas dta ON dta.terminal_id = t.id
  WHERE t.device_token = _token
  GROUP BY t.id;
$$;

-- Unpair: manager revokes a device token
CREATE OR REPLACE FUNCTION public.unpair_display_terminal(_terminal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _venue_id uuid;
BEGIN
  SELECT venue_id INTO _venue_id FROM public.display_terminals WHERE id = _terminal_id;
  IF _venue_id IS NULL THEN
    RAISE EXCEPTION 'Terminal not found';
  END IF;
  IF NOT public.is_venue_manager(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.display_terminals
  SET device_token = NULL,
      paired_at = NULL,
      paired_by = NULL,
      last_seen_at = NULL,
      user_agent = NULL
  WHERE id = _terminal_id;

  RETURN true;
END;
$$;
