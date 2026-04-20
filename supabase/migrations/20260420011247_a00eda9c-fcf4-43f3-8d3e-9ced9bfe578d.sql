-- 1. Add throttling columns to venue_display_areas
ALTER TABLE public.venue_display_areas
  ADD COLUMN IF NOT EXISTS throttle_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS throttle_mode text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS throttle_max_orders integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS throttle_window_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS throttle_block_timeout_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS throttle_block_until timestamptz,
  ADD COLUMN IF NOT EXISTS throttle_show_wait_to_diner boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS base_prep_time_minutes integer NOT NULL DEFAULT 15;

ALTER TABLE public.venue_display_areas
  DROP CONSTRAINT IF EXISTS venue_display_areas_throttle_mode_check;
ALTER TABLE public.venue_display_areas
  ADD CONSTRAINT venue_display_areas_throttle_mode_check
  CHECK (throttle_mode IN ('open','auto','block','test'));

-- 2. Add throttling fields to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS throttled_until timestamptz,
  ADD COLUMN IF NOT EXISTS extra_wait_minutes integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_throttled_until ON public.orders (throttled_until)
  WHERE throttled_until IS NOT NULL;

-- 3. order_throttle_log
CREATE TABLE IF NOT EXISTS public.order_throttle_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  display_area_id uuid NOT NULL REFERENCES public.venue_display_areas(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('queued','released','blocked','bumped')),
  queue_size_at_event integer NOT NULL DEFAULT 0,
  wait_added_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_throttle_log_area_time
  ON public.order_throttle_log (display_area_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_throttle_log_order
  ON public.order_throttle_log (order_id);

ALTER TABLE public.order_throttle_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view throttle log"
  ON public.order_throttle_log FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "System can insert throttle log"
  ON public.order_throttle_log FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- 4. Trigger: apply throttling on order insert
CREATE OR REPLACE FUNCTION public.apply_throttle_on_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _area RECORD;
  _queue_size integer;
  _per_order_minutes numeric;
  _release_at timestamptz;
  _wait_added integer;
  _max_release_at timestamptz := NULL;
  _max_wait integer := 0;
BEGIN
  -- Iterate distinct display areas this order's items route to.
  -- An order may have items mapped via menu_item_display_areas OR fall back to category mapping.
  FOR _area IN
    SELECT DISTINCT da.*
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_item_display_areas mida ON mida.menu_item_id = mi.id
    LEFT JOIN public.menu_category_display_areas mcda ON mcda.category_id = mi.category_id
    JOIN public.venue_display_areas da
      ON da.id = COALESCE(mida.display_area_id, mcda.display_area_id)
     AND da.venue_id = NEW.venue_id
    WHERE oi.order_id = NEW.id
      AND da.throttle_enabled = true
  LOOP
    -- count current queue for this area (orders still throttled)
    SELECT count(*) INTO _queue_size
    FROM public.orders o
    WHERE o.venue_id = NEW.venue_id
      AND o.throttled_until IS NOT NULL
      AND o.throttled_until > now()
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi2
        JOIN public.menu_items mi2 ON mi2.id = oi2.menu_item_id
        LEFT JOIN public.menu_item_display_areas mida2 ON mida2.menu_item_id = mi2.id
        LEFT JOIN public.menu_category_display_areas mcda2 ON mcda2.category_id = mi2.category_id
        WHERE oi2.order_id = o.id
          AND COALESCE(mida2.display_area_id, mcda2.display_area_id) = _area.id
      );

    _per_order_minutes := GREATEST(_area.throttle_window_minutes::numeric / NULLIF(_area.throttle_max_orders, 0), 1);

    IF _area.throttle_mode = 'block' THEN
      _release_at := COALESCE(_area.throttle_block_until, now() + (_area.throttle_block_timeout_minutes || ' minutes')::interval);
      _wait_added := EXTRACT(EPOCH FROM (_release_at - now()))::int / 60;
      INSERT INTO public.order_throttle_log (order_id, display_area_id, venue_id, event, queue_size_at_event, wait_added_minutes)
      VALUES (NEW.id, _area.id, NEW.venue_id, 'blocked', _queue_size, _wait_added);

    ELSIF _area.throttle_mode = 'auto' THEN
      _release_at := now() + ((_queue_size + 1) * _per_order_minutes || ' minutes')::interval;
      _wait_added := CEIL((_queue_size + 1) * _per_order_minutes)::int;
      INSERT INTO public.order_throttle_log (order_id, display_area_id, venue_id, event, queue_size_at_event, wait_added_minutes)
      VALUES (NEW.id, _area.id, NEW.venue_id, 'queued', _queue_size, _wait_added);

    ELSIF _area.throttle_mode = 'test' THEN
      -- log + diner-facing wait, but do not actually delay
      _release_at := NULL;
      _wait_added := CEIL((_queue_size + 1) * _per_order_minutes)::int;
      INSERT INTO public.order_throttle_log (order_id, display_area_id, venue_id, event, queue_size_at_event, wait_added_minutes)
      VALUES (NEW.id, _area.id, NEW.venue_id, 'queued', _queue_size, _wait_added);

    ELSE
      _release_at := NULL;
      _wait_added := 0;
    END IF;

    IF _release_at IS NOT NULL AND (_max_release_at IS NULL OR _release_at > _max_release_at) THEN
      _max_release_at := _release_at;
    END IF;
    IF _wait_added > _max_wait THEN
      _max_wait := _wait_added;
    END IF;
  END LOOP;

  IF _max_release_at IS NOT NULL OR _max_wait > 0 THEN
    UPDATE public.orders
    SET throttled_until = _max_release_at,
        extra_wait_minutes = _max_wait
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fire AFTER order_items are likely inserted. Since order_items insert separately,
-- we instead fire on order_items insert and re-apply if not already done.
-- Simpler: trigger on orders AFTER INSERT but defer via a status check is messy.
-- Use AFTER INSERT on order_items, and only run if order has no extra_wait yet.
CREATE OR REPLACE FUNCTION public.apply_throttle_on_first_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ord public.orders%ROWTYPE;
  _already_done boolean;
BEGIN
  SELECT * INTO _ord FROM public.orders WHERE id = NEW.order_id;
  IF _ord.id IS NULL THEN RETURN NEW; END IF;

  -- only run once per order (first item insert that finds throttle eligible)
  SELECT EXISTS (
    SELECT 1 FROM public.order_throttle_log WHERE order_id = NEW.order_id
  ) INTO _already_done;
  IF _already_done THEN RETURN NEW; END IF;

  PERFORM public.apply_throttle_on_order_insert_for(_ord.id, _ord.venue_id);
  RETURN NEW;
END;
$$;

-- Helper that does the actual work given an order id (called after items inserted)
CREATE OR REPLACE FUNCTION public.apply_throttle_on_order_insert_for(_order_id uuid, _venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _area RECORD;
  _queue_size integer;
  _per_order_minutes numeric;
  _release_at timestamptz;
  _wait_added integer;
  _max_release_at timestamptz := NULL;
  _max_wait integer := 0;
BEGIN
  FOR _area IN
    SELECT DISTINCT da.*
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_item_display_areas mida ON mida.menu_item_id = mi.id
    LEFT JOIN public.menu_category_display_areas mcda ON mcda.category_id = mi.category_id
    JOIN public.venue_display_areas da
      ON da.id = COALESCE(mida.display_area_id, mcda.display_area_id)
     AND da.venue_id = _venue_id
    WHERE oi.order_id = _order_id
      AND da.throttle_enabled = true
  LOOP
    SELECT count(*) INTO _queue_size
    FROM public.orders o
    WHERE o.venue_id = _venue_id
      AND o.throttled_until IS NOT NULL
      AND o.throttled_until > now()
      AND o.id <> _order_id
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi2
        JOIN public.menu_items mi2 ON mi2.id = oi2.menu_item_id
        LEFT JOIN public.menu_item_display_areas mida2 ON mida2.menu_item_id = mi2.id
        LEFT JOIN public.menu_category_display_areas mcda2 ON mcda2.category_id = mi2.category_id
        WHERE oi2.order_id = o.id
          AND COALESCE(mida2.display_area_id, mcda2.display_area_id) = _area.id
      );

    _per_order_minutes := GREATEST(_area.throttle_window_minutes::numeric / NULLIF(_area.throttle_max_orders, 0), 1);

    IF _area.throttle_mode = 'block' THEN
      _release_at := COALESCE(_area.throttle_block_until, now() + (_area.throttle_block_timeout_minutes || ' minutes')::interval);
      _wait_added := GREATEST(EXTRACT(EPOCH FROM (_release_at - now()))::int / 60, 0);
      INSERT INTO public.order_throttle_log (order_id, display_area_id, venue_id, event, queue_size_at_event, wait_added_minutes)
      VALUES (_order_id, _area.id, _venue_id, 'blocked', _queue_size, _wait_added);

    ELSIF _area.throttle_mode = 'auto' THEN
      _release_at := now() + ((_queue_size + 1) * _per_order_minutes || ' minutes')::interval;
      _wait_added := CEIL((_queue_size + 1) * _per_order_minutes)::int;
      INSERT INTO public.order_throttle_log (order_id, display_area_id, venue_id, event, queue_size_at_event, wait_added_minutes)
      VALUES (_order_id, _area.id, _venue_id, 'queued', _queue_size, _wait_added);

    ELSIF _area.throttle_mode = 'test' THEN
      _release_at := NULL;
      _wait_added := CEIL((_queue_size + 1) * _per_order_minutes)::int;
      INSERT INTO public.order_throttle_log (order_id, display_area_id, venue_id, event, queue_size_at_event, wait_added_minutes)
      VALUES (_order_id, _area.id, _venue_id, 'queued', _queue_size, _wait_added);

    ELSE
      _release_at := NULL;
      _wait_added := 0;
    END IF;

    IF _release_at IS NOT NULL AND (_max_release_at IS NULL OR _release_at > _max_release_at) THEN
      _max_release_at := _release_at;
    END IF;
    IF _wait_added > _max_wait THEN
      _max_wait := _wait_added;
    END IF;
  END LOOP;

  IF _max_release_at IS NOT NULL OR _max_wait > 0 THEN
    UPDATE public.orders
    SET throttled_until = _max_release_at,
        extra_wait_minutes = _max_wait
    WHERE id = _order_id;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_throttle ON public.order_items;
CREATE TRIGGER trg_apply_throttle
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_throttle_on_first_item();

-- 5. Realtime
ALTER TABLE public.venue_display_areas REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_display_areas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;