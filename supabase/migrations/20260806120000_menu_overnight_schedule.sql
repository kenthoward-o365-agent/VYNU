-- The diner menu shows "No items available" for most of the trading day.
--
-- resolve_menu_for_table tests a menu's service window with:
--
--   AND (m.start_time IS NULL OR _time >= m.start_time)
--   AND (m.end_time   IS NULL OR _time <= m.end_time)
--
-- That is only correct when start_time < end_time. Any menu that crosses
-- midnight — which is normal for a pub — fails the test for its entire evening
-- service, and only matches between midnight and its end time.
--
-- Observed on staging at Young & Jackson, Thursday 17:43 Melbourne:
--
--   Bistro        10:00-02:00   79 items   excluded  (17:43 <= 02:00 is false)
--   Chloe's       16:00-00:00   31 items   excluded  (17:43 <= 00:00 is false)
--   Pre-Theatre   17:00-19:00    0 items   excluded  (Fri/Sat only)
--   XMAS in July  17:00-22:00    0 items   SELECTED
--
-- Bistro is the menu the table's zone is assigned. It is read correctly and
-- then discarded at the schedule check, so the function falls through to
-- "first in-schedule menu by display_order" and lands on an empty menu. The
-- diner sees nothing.
--
-- Two changes:
--
--   1. Compare the time window in a way that understands an overnight window.
--   2. Do not let an empty menu win the *fallback*. The fallback is a guess
--      when the zone has no usable menu, and guessing an empty one produces
--      exactly the symptom above. An explicitly assigned zone menu is still
--      honoured even if empty — that is a deliberate operator choice, not a
--      guess, and silently substituting a different menu would be worse.

-- Shared window test. IMMUTABLE and pure: no table access, safe to inline.
CREATE OR REPLACE FUNCTION public.time_within_window(_t time, _start time, _end time)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Unbounded on both sides: always open. Matches the previous behaviour
    -- where a NULL bound simply dropped its half of the comparison.
    WHEN _start IS NULL AND _end IS NULL THEN true
    WHEN _start IS NULL THEN _t <= _end
    WHEN _end   IS NULL THEN _t >= _start
    -- Same-day window, e.g. 17:00-19:00.
    WHEN _start <= _end THEN _t >= _start AND _t <= _end
    -- Window crosses midnight, e.g. 10:00-02:00 or 16:00-00:00.
    ELSE _t >= _start OR _t <= _end
  END
$$;

COMMENT ON FUNCTION public.time_within_window(time, time, time) IS
  'True when _t falls inside [_start, _end], handling windows that cross midnight (_start > _end). A NULL bound means unbounded on that side.';

REVOKE ALL ON FUNCTION public.time_within_window(time, time, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.time_within_window(time, time, time) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_menu_for_table(_venue_id uuid, _table_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- The zone's menu wins when it is active and in schedule. No emptiness check
  -- here: an explicit assignment is honoured as configured.
  IF _menu IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.venue_menus m
    WHERE m.id = _menu AND m.is_active
      AND _dow = ANY (m.active_days)
      AND public.time_within_window(_time, m.start_time, m.end_time)
  ) THEN
    RETURN _menu;
  END IF;

  -- Fallback when the zone has no usable menu. Skip menus with no items, so a
  -- half-configured menu cannot blank the diner's screen.
  SELECT m.id INTO _menu
  FROM public.venue_menus m
  WHERE m.venue_id = _venue_id AND m.is_active
    AND _dow = ANY (m.active_days)
    AND public.time_within_window(_time, m.start_time, m.end_time)
    AND EXISTS (
      SELECT 1
      FROM public.menu_categories mc
      JOIN public.menu_items mi ON mi.category_id = mc.id
      WHERE mc.menu_id = m.id
    )
  ORDER BY m.display_order, m.created_at
  LIMIT 1;

  RETURN _menu;
END;
$function$;
