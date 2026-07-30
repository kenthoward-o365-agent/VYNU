-- 1. Menus
CREATE TABLE public.venue_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  active_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  start_time time,
  end_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_venue_menus_venue ON public.venue_menus(venue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_menus TO authenticated;
GRANT SELECT ON public.venue_menus TO anon;
GRANT ALL ON public.venue_menus TO service_role;
ALTER TABLE public.venue_menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_menus_public_read" ON public.venue_menus FOR SELECT USING (true);
CREATE POLICY "venue_menus_manager_write" ON public.venue_menus FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id) OR public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id) OR public.has_role(auth.uid(), 'tabless_admin'));

CREATE TRIGGER trg_venue_menus_updated_at BEFORE UPDATE ON public.venue_menus
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Zones
CREATE TABLE public.venue_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#7C5CFC',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  menu_id uuid REFERENCES public.venue_menus(id) ON DELETE SET NULL,
  tabs_enabled boolean NOT NULL DEFAULT false,
  require_preauth boolean NOT NULL DEFAULT false,
  preauth_amount numeric(10,2) NOT NULL DEFAULT 50,
  max_tab_amount numeric(10,2),
  allow_split_payments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);
CREATE INDEX idx_venue_zones_venue ON public.venue_zones(venue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_zones TO authenticated;
GRANT SELECT ON public.venue_zones TO anon;
GRANT ALL ON public.venue_zones TO service_role;
ALTER TABLE public.venue_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_zones_public_read" ON public.venue_zones FOR SELECT USING (true);
CREATE POLICY "venue_zones_manager_write" ON public.venue_zones FOR ALL TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id) OR public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id) OR public.has_role(auth.uid(), 'tabless_admin'));

CREATE TRIGGER trg_venue_zones_updated_at BEFORE UPDATE ON public.venue_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Categories belong to a menu
ALTER TABLE public.menu_categories ADD COLUMN menu_id uuid REFERENCES public.venue_menus(id) ON DELETE CASCADE;
CREATE INDEX idx_menu_categories_menu ON public.menu_categories(menu_id);

-- 4. Tables link to a zone
ALTER TABLE public.tables ADD COLUMN zone_id uuid REFERENCES public.venue_zones(id) ON DELETE SET NULL;
CREATE INDEX idx_tables_zone ON public.tables(zone_id);

-- 5. Backfill: one Main Menu per venue that has any categories or items
INSERT INTO public.venue_menus (venue_id, name, description, display_order)
SELECT v.id, 'Main Menu', 'Default menu', 0
FROM public.venues v
WHERE EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.venue_id = v.id)
   OR EXISTS (SELECT 1 FROM public.menu_items i WHERE i.venue_id = v.id);

UPDATE public.menu_categories c
SET menu_id = m.id
FROM public.venue_menus m
WHERE m.venue_id = c.venue_id AND m.name = 'Main Menu' AND c.menu_id IS NULL;

-- 6. Backfill zones from existing table zone labels + tab zone config
INSERT INTO public.venue_zones (venue_id, name, display_order)
SELECT DISTINCT t.venue_id, t.zone, 0
FROM public.tables t
WHERE t.zone IS NOT NULL AND btrim(t.zone) <> ''
ON CONFLICT (venue_id, name) DO NOTHING;

INSERT INTO public.venue_zones (venue_id, name, display_order)
SELECT DISTINCT z.venue_id, z.zone, 0
FROM public.venue_tab_zones z
WHERE z.zone IS NOT NULL AND btrim(z.zone) <> ''
ON CONFLICT (venue_id, name) DO NOTHING;

UPDATE public.venue_zones z
SET tabs_enabled = t.tabs_enabled,
    require_preauth = t.require_preauth,
    preauth_amount = t.preauth_amount,
    max_tab_amount = t.max_tab_amount,
    allow_split_payments = t.allow_split_payments
FROM public.venue_tab_zones t
WHERE t.venue_id = z.venue_id AND t.zone = z.name;

UPDATE public.venue_zones z
SET menu_id = m.id
FROM public.venue_menus m
WHERE m.venue_id = z.venue_id AND m.name = 'Main Menu' AND z.menu_id IS NULL;

UPDATE public.tables t
SET zone_id = z.id
FROM public.venue_zones z
WHERE z.venue_id = t.venue_id AND z.name = t.zone AND t.zone_id IS NULL;

-- 7. Keep tables.zone text in sync with zone_id
CREATE OR REPLACE FUNCTION public.sync_table_zone_label()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.zone_id IS NOT NULL THEN
    SELECT name INTO NEW.zone FROM public.venue_zones WHERE id = NEW.zone_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_table_zone_label
BEFORE INSERT OR UPDATE OF zone_id ON public.tables
FOR EACH ROW EXECUTE FUNCTION public.sync_table_zone_label();

-- 8. Resolve the menu a table should show
CREATE OR REPLACE FUNCTION public.resolve_menu_for_table(_venue_id uuid, _table_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz text;
  _local timestamp;
  _dow int;
  _time time;
  _menu uuid;
BEGIN
  SELECT COALESCE(timezone, 'Australia/Melbourne') INTO _tz FROM public.venues WHERE id = _venue_id;
  IF _tz IS NULL THEN _tz := 'Australia/Melbourne'; END IF;
  _local := now() AT TIME ZONE _tz;
  _dow := EXTRACT(DOW FROM _local)::int;
  _time := _local::time;

  IF _table_id IS NOT NULL THEN
    SELECT z.menu_id INTO _menu
    FROM public.tables t
    JOIN public.venue_zones z ON z.id = t.zone_id
    WHERE t.id = _table_id AND t.venue_id = _venue_id AND z.is_active;
  END IF;

  -- Zone menu must be active and in schedule
  IF _menu IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.venue_menus m
    WHERE m.id = _menu AND m.is_active
      AND _dow = ANY (m.active_days)
      AND (m.start_time IS NULL OR _time >= m.start_time)
      AND (m.end_time IS NULL OR _time <= m.end_time)
  ) THEN
    RETURN _menu;
  END IF;

  -- Fall back to the first in-schedule active menu for the venue
  SELECT m.id INTO _menu
  FROM public.venue_menus m
  WHERE m.venue_id = _venue_id AND m.is_active
    AND _dow = ANY (m.active_days)
    AND (m.start_time IS NULL OR _time >= m.start_time)
    AND (m.end_time IS NULL OR _time <= m.end_time)
  ORDER BY m.display_order, m.created_at
  LIMIT 1;

  RETURN _menu;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_menu_for_table(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_menu_for_table(uuid, uuid) TO anon, authenticated, service_role;

-- 9. Menu snapshot scoped to the resolved menu
CREATE OR REPLACE FUNCTION public.get_menu_snapshot(_venue_id uuid, _table_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH tbl AS (
    SELECT t.id, t.table_number, t.zone_id
    FROM public.tables t
    WHERE t.venue_id = _venue_id
      AND _table_id IS NOT NULL
      AND ((t.id::text = _table_id) OR (t.table_number = _table_id))
    LIMIT 1
  ), resolved AS (
    SELECT public.resolve_menu_for_table(_venue_id, (SELECT id FROM tbl)) AS menu_id
  )
  SELECT jsonb_build_object(
    'venue', (
      SELECT to_jsonb(v) - 'created_at' - 'updated_at'
      FROM public.venues v WHERE v.id = _venue_id
    ),
    'table', (SELECT jsonb_build_object('id', id, 'table_number', table_number) FROM tbl),
    'menu', (
      SELECT jsonb_build_object('id', m.id, 'name', m.name)
      FROM public.venue_menus m WHERE m.id = (SELECT menu_id FROM resolved)
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', mi.id,
        'name', mi.name,
        'description', mi.description,
        'price', mi.price,
        'image_url', mi.image_url,
        'dietary_tags', mi.dietary_tags,
        'allergens', mi.allergens,
        'is_available', mi.is_available,
        'category_id', mi.category_id,
        'display_order', mi.display_order
      ) ORDER BY mi.display_order)
      FROM public.menu_items mi
      LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
      WHERE mi.venue_id = _venue_id
        AND mi.is_available = true
        AND (
          (SELECT menu_id FROM resolved) IS NULL
          OR mc.menu_id IS NULL
          OR mc.menu_id = (SELECT menu_id FROM resolved)
        )
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'display_order', c.display_order
      ) ORDER BY c.display_order)
      FROM public.menu_categories c
      WHERE c.venue_id = _venue_id
        AND c.is_active = true
        AND (
          (SELECT menu_id FROM resolved) IS NULL
          OR c.menu_id IS NULL
          OR c.menu_id = (SELECT menu_id FROM resolved)
        )
    ), '[]'::jsonb),
    'pricing', jsonb_build_object(
      'rules', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
        FROM public.pricing_rules r
        WHERE r.venue_id = _venue_id AND r.is_active = true
      ), '[]'::jsonb),
      'links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'pricing_rule_id', l.pricing_rule_id,
          'menu_item_id', l.menu_item_id
        ))
        FROM public.pricing_rule_items l
        JOIN public.pricing_rules r ON r.id = l.pricing_rule_id
        WHERE r.venue_id = _venue_id AND r.is_active = true
      ), '[]'::jsonb)
    ),
    'ai', (
      SELECT jsonb_build_object(
        'chat_mode', a.chat_mode,
        'agent_name', a.agent_name,
        'agent_icon_url', a.agent_icon_url
      )
      FROM public.venue_ai_config a WHERE a.venue_id = _venue_id LIMIT 1
    ),
    'generated_at', now()
  );
$function$;

-- 10. Tab rules now read venue_zones
CREATE OR REPLACE FUNCTION public.get_table_tab_rules(_venue_id uuid, _table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _zone_id uuid;
  _rules public.venue_zones%ROWTYPE;
  _open_tab uuid;
BEGIN
  SELECT zone_id INTO _zone_id FROM public.tables WHERE id = _table_id AND venue_id = _venue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tabs_enabled', false);
  END IF;

  IF _zone_id IS NOT NULL THEN
    SELECT * INTO _rules FROM public.venue_zones WHERE id = _zone_id;
  END IF;

  SELECT id INTO _open_tab FROM public.table_tabs
   WHERE table_id = _table_id AND venue_id = _venue_id AND status = 'open'
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'zone', _rules.name,
    'zone_id', _zone_id,
    'tabs_enabled', COALESCE(_rules.tabs_enabled, false),
    'require_preauth', COALESCE(_rules.require_preauth, false),
    'preauth_amount', _rules.preauth_amount,
    'max_tab_amount', _rules.max_tab_amount,
    'allow_split_payments', COALESCE(_rules.allow_split_payments, true),
    'open_tab_id', _open_tab
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_or_open_tab(_venue_id uuid, _table_id uuid, _session_id uuid DEFAULT NULL::uuid, _diner_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tab_id uuid;
  _zone_id uuid;
  _rules public.venue_zones%ROWTYPE;
BEGIN
  SELECT zone_id INTO _zone_id FROM public.tables WHERE id = _table_id AND venue_id = _venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found for venue'; END IF;

  IF _zone_id IS NOT NULL THEN
    SELECT * INTO _rules FROM public.venue_zones WHERE id = _zone_id;
  END IF;

  IF _rules.id IS NULL OR NOT _rules.tabs_enabled THEN
    RAISE EXCEPTION 'Tabs are not enabled for this area';
  END IF;

  SELECT id INTO _tab_id FROM public.table_tabs
   WHERE table_id = _table_id AND venue_id = _venue_id AND status = 'open'
   ORDER BY created_at DESC LIMIT 1;
  IF _tab_id IS NOT NULL THEN RETURN _tab_id; END IF;

  INSERT INTO public.table_tabs (
    venue_id, table_id, session_id, zone, opened_by_diner_id,
    preauth_required, preauth_amount, max_tab_amount
  ) VALUES (
    _venue_id, _table_id, _session_id, _rules.name, _diner_id,
    _rules.require_preauth, _rules.preauth_amount, _rules.max_tab_amount
  ) RETURNING id INTO _tab_id;

  RETURN _tab_id;
END;
$function$;