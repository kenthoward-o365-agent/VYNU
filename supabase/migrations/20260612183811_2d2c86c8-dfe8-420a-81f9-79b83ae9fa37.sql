-- 1) Defensive column-level revoke for webhook signing secrets.
REVOKE SELECT (secret) ON public.api_webhooks FROM PUBLIC, anon, authenticated;

-- 2) Remove broad cross-venue public menu item access.
DROP POLICY IF EXISTS "menu_items_select_public_available" ON public.menu_items;
REVOKE SELECT ON public.menu_items FROM anon;

-- 3) Venue/order-scoped receipt helper so consumer receipt does not read menu_items directly.
CREATE OR REPLACE FUNCTION public.get_receipt_items_public(
  _venue_id uuid,
  _order_id uuid
)
RETURNS TABLE(
  id uuid,
  menu_item_id uuid,
  quantity integer,
  unit_price numeric,
  modifiers jsonb,
  menu_item_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    oi.id,
    oi.menu_item_id,
    oi.quantity,
    oi.unit_price,
    oi.modifiers,
    COALESCE(mi.name, 'Item') AS menu_item_name
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id AND mi.venue_id = o.venue_id
  WHERE oi.order_id = _order_id
    AND o.venue_id = _venue_id;
$$;
REVOKE ALL ON FUNCTION public.get_receipt_items_public(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_receipt_items_public(uuid, uuid) TO anon, authenticated;

-- 4) Staff can no longer read full diner profile rows merely because a diner visited a venue.
-- Managers and group admins keep CRM access; diners keep own-profile access.
DROP POLICY IF EXISTS "Staff can view diners via visits" ON public.diner_profiles;
CREATE POLICY "Managers can view diners via visits"
ON public.diner_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.diner_visits dv
    JOIN public.venues v ON v.id = dv.venue_id
    WHERE dv.diner_id = diner_profiles.id
      AND (
        public.is_venue_manager(auth.uid(), v.id)
        OR (v.group_id IS NOT NULL AND public.is_group_admin(auth.uid(), v.group_id))
      )
  )
);

-- 5) Database-side guard against anonymous table-session flooding.
CREATE OR REPLACE FUNCTION public.can_create_table_session(_venue_id uuid, _table_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tables t
    WHERE t.id = _table_id
      AND t.venue_id = _venue_id
      AND COALESCE(t.status, 'available') <> 'disabled'
  )
  AND (
    SELECT count(*)
    FROM public.table_sessions ts
    WHERE ts.venue_id = _venue_id
      AND ts.table_id = _table_id
      AND ts.status IN ('open', 'firing')
      AND ts.auto_close_at > now()
  ) < 5
  AND (
    SELECT count(*)
    FROM public.table_sessions ts
    WHERE ts.venue_id = _venue_id
      AND ts.table_id = _table_id
      AND ts.created_at > now() - interval '1 hour'
  ) < 20;
$$;
REVOKE ALL ON FUNCTION public.can_create_table_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_table_session(uuid, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can create a session for a real table" ON public.table_sessions;
CREATE POLICY "Anyone can create a limited session for a real table"
ON public.table_sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'open'
  AND public.can_create_table_session(venue_id, table_id)
);

CREATE OR REPLACE FUNCTION public.enforce_table_session_insert_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT public.can_create_table_session(NEW.venue_id, NEW.table_id) THEN
    RAISE EXCEPTION 'Too many open sessions for this table';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_table_session_insert_limits ON public.table_sessions;
CREATE TRIGGER enforce_table_session_insert_limits
BEFORE INSERT ON public.table_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_table_session_insert_limits();

CREATE OR REPLACE FUNCTION public.find_or_create_table_session(
  _venue_id uuid,
  _table_id uuid,
  _fire_strategy text DEFAULT 'wait_for_all'::text,
  _host_diner_id uuid DEFAULT NULL::uuid,
  _display_name text DEFAULT NULL::text,
  _join_existing_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _session_id uuid;
  _idle_close_minutes integer := 20;
  _settings jsonb;
BEGIN
  IF _venue_id IS NULL OR _table_id IS NULL THEN
    RAISE EXCEPTION 'venue_id and table_id are required';
  END IF;

  SELECT COALESCE(settings->'table_session', '{}'::jsonb) INTO _settings
  FROM public.venues WHERE id = _venue_id;

  _idle_close_minutes := COALESCE((_settings->>'idle_close_minutes')::int, 20);

  IF _join_existing_id IS NOT NULL THEN
    UPDATE public.table_sessions
    SET diner_count = diner_count + 1,
        auto_close_at = now() + (_idle_close_minutes || ' minutes')::interval
    WHERE id = _join_existing_id
      AND venue_id = _venue_id
      AND table_id = _table_id
      AND status = 'open'
      AND auto_close_at > now()
    RETURNING id INTO _session_id;

    IF _session_id IS NOT NULL THEN
      RETURN _session_id;
    END IF;
  END IF;

  IF NOT public.can_create_table_session(_venue_id, _table_id) THEN
    RAISE EXCEPTION 'Too many open sessions for this table';
  END IF;

  INSERT INTO public.table_sessions (
    venue_id, table_id, fire_strategy, host_diner_id, display_name, auto_close_at
  )
  VALUES (
    _venue_id,
    _table_id,
    COALESCE(_fire_strategy, 'wait_for_all'),
    _host_diner_id,
    LEFT(NULLIF(_display_name, ''), 80),
    now() + (_idle_close_minutes || ' minutes')::interval
  )
  RETURNING id INTO _session_id;

  RETURN _session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.find_or_create_table_session(uuid, uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_table_session(uuid, uuid, text, uuid, text, uuid) TO anon, authenticated;