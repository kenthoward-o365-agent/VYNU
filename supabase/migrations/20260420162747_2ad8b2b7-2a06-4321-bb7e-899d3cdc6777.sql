-- ============================================
-- Table Sessions: bundle multi-diner orders
-- ============================================

CREATE TABLE IF NOT EXISTS public.table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','firing','closed')),
  diner_count integer NOT NULL DEFAULT 1,
  fire_strategy text NOT NULL DEFAULT 'wait_for_all' CHECK (fire_strategy IN ('wait_for_all','fire_per_course','manual')),
  host_diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  display_name text,
  is_discoverable boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now(),
  auto_close_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  fired_at timestamptz,
  fired_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_open_table
  ON public.table_sessions (venue_id, table_id, status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_table_sessions_status_auto_close
  ON public.table_sessions (status, auto_close_at);

-- Trigger: keep updated_at fresh
CREATE TRIGGER trg_table_sessions_updated_at
BEFORE UPDATE ON public.table_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read open sessions"
ON public.table_sessions FOR SELECT
TO anon, authenticated
USING (status IN ('open','firing'));

CREATE POLICY "Staff can read all sessions"
ON public.table_sessions FOR SELECT
TO authenticated
USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Anyone can create a session"
ON public.table_sessions FOR INSERT
TO anon, authenticated
WITH CHECK (venue_id IS NOT NULL AND table_id IS NOT NULL);

CREATE POLICY "Anyone can update open sessions at table"
ON public.table_sessions FOR UPDATE
TO anon, authenticated
USING (status IN ('open','firing'))
WITH CHECK (true);

CREATE POLICY "Staff can update sessions"
ON public.table_sessions FOR UPDATE
TO authenticated
USING (public.is_venue_staff(auth.uid(), venue_id))
WITH CHECK (public.is_venue_staff(auth.uid(), venue_id));

-- ============================================
-- orders: link to session + denormalised mode + fired_at
-- ============================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_mode text CHECK (session_mode IN ('solo','group')),
  ADD COLUMN IF NOT EXISTS fired_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_session_id ON public.orders (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_venue_unfired ON public.orders (venue_id) WHERE fired_at IS NULL AND session_id IS NOT NULL;

-- ============================================
-- RPC: find_or_create_table_session
-- Opens or joins an active session for (venue, table)
-- ============================================
CREATE OR REPLACE FUNCTION public.find_or_create_table_session(
  _venue_id uuid,
  _table_id uuid,
  _fire_strategy text DEFAULT 'wait_for_all',
  _host_diner_id uuid DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _join_existing_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_id uuid;
  _idle_close_minutes integer := 20;
  _settings jsonb;
BEGIN
  IF _venue_id IS NULL OR _table_id IS NULL THEN
    RAISE EXCEPTION 'venue_id and table_id are required';
  END IF;

  -- Pull venue settings (best-effort)
  SELECT COALESCE(settings->'table_session', '{}'::jsonb) INTO _settings
  FROM public.venues WHERE id = _venue_id;

  _idle_close_minutes := COALESCE((_settings->>'idle_close_minutes')::int, 20);

  -- If the diner explicitly chose to join a specific session, validate + bump it
  IF _join_existing_id IS NOT NULL THEN
    UPDATE public.table_sessions
    SET diner_count = diner_count + 1,
        auto_close_at = now() + (_idle_close_minutes || ' minutes')::interval
    WHERE id = _join_existing_id
      AND venue_id = _venue_id
      AND table_id = _table_id
      AND status = 'open'
    RETURNING id INTO _session_id;

    IF _session_id IS NOT NULL THEN
      RETURN _session_id;
    END IF;
    -- Fall through if the requested session was already closed
  END IF;

  -- Otherwise, create a new session (host)
  INSERT INTO public.table_sessions (
    venue_id, table_id, fire_strategy, host_diner_id, display_name,
    auto_close_at
  )
  VALUES (
    _venue_id, _table_id,
    COALESCE(_fire_strategy, 'wait_for_all'),
    _host_diner_id, _display_name,
    now() + (_idle_close_minutes || ' minutes')::interval
  )
  RETURNING id INTO _session_id;

  RETURN _session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_create_table_session(uuid, uuid, text, uuid, text, uuid) TO anon, authenticated;

-- ============================================
-- RPC: list_open_sessions_at_table
-- Returns discoverable open sessions for the diner chooser
-- ============================================
CREATE OR REPLACE FUNCTION public.list_open_sessions_at_table(
  _venue_id uuid,
  _table_id uuid
)
RETURNS TABLE(
  id uuid,
  display_name text,
  diner_count integer,
  opened_at timestamptz,
  fire_strategy text,
  host_first_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ts.id,
    ts.display_name,
    ts.diner_count,
    ts.opened_at,
    ts.fire_strategy,
    dp.first_name AS host_first_name
  FROM public.table_sessions ts
  LEFT JOIN public.diner_profiles dp ON dp.id = ts.host_diner_id
  WHERE ts.venue_id = _venue_id
    AND ts.table_id = _table_id
    AND ts.status = 'open'
    AND ts.is_discoverable = true
    AND ts.auto_close_at > now()
  ORDER BY ts.opened_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_open_sessions_at_table(uuid, uuid) TO anon, authenticated;

-- ============================================
-- RPC: fire_table_session
-- Marks the bundle as fired so kitchen sees it
-- ============================================
CREATE OR REPLACE FUNCTION public.fire_table_session(_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
BEGIN
  UPDATE public.table_sessions
  SET status = 'firing',
      fired_at = _now,
      fired_by = auth.uid()
  WHERE id = _session_id
    AND status = 'open';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.orders
  SET fired_at = _now
  WHERE session_id = _session_id
    AND fired_at IS NULL;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fire_table_session(uuid) TO anon, authenticated;

-- ============================================
-- RPC: close_table_session (staff only)
-- ============================================
CREATE OR REPLACE FUNCTION public.close_table_session(_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _venue_id uuid;
BEGIN
  SELECT venue_id INTO _venue_id FROM public.table_sessions WHERE id = _session_id;
  IF _venue_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.is_venue_staff(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.table_sessions
  SET status = 'closed',
      closed_at = now()
  WHERE id = _session_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_table_session(uuid) TO authenticated;

-- ============================================
-- Realtime
-- ============================================
ALTER TABLE public.table_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
