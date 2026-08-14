-- HLRDRNW-68 · IVA-01 (follow-up) — make order-line pricing fully
-- server-authoritative and schedule-aware.
--
-- The first cut (20260727120000) used a permissive, schedule-independent floor:
-- it only *rejected* a unit_price below the best-possible discount and left the
-- client's value otherwise untouched. That allowed a diner to claim a scheduled
-- discount (e.g. happy hour) outside its active window.
--
-- This replaces the trigger function so it now:
--   1. evaluates each pricing rule's date / day-of-week / time-of-day window in
--      the VENUE's timezone (mirroring the client-side resolvePrice()), and
--   2. OVERWRITES unit_price with the server-computed price (base with the best
--      currently-active discount), so the client's price is ignored entirely.
-- Modifier prices are still re-derived from the authoritative `modifiers` table.
--
-- CREATE OR REPLACE keeps the existing triggers (they call this function by
-- name); no trigger/DDL changes are needed.
CREATE OR REPLACE FUNCTION public.enforce_order_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _venue_id uuid;
  _tz text;
  _local timestamp;     -- venue-local wall clock ("now" in the venue timezone)
  _dow int;             -- 0=Sun .. 6=Sat, matching the client's Date.getDay()
  _minutes int;         -- minutes since midnight, venue-local
  _base numeric;
  _price numeric;       -- authoritative unit price
  _elem jsonb;
  _new_mods jsonb := '[]'::jsonb;
  _mod_price numeric;
BEGIN
  -- Authoritative venue comes from the parent order, never from the client row.
  SELECT venue_id INTO _venue_id FROM public.orders WHERE id = NEW.order_id;
  IF _venue_id IS NULL THEN
    RAISE EXCEPTION 'order_items.order_id % has no owning order', NEW.order_id;
  END IF;

  -- Authoritative base price for this menu item, scoped to the order's venue.
  SELECT price INTO _base
  FROM public.menu_items
  WHERE id = NEW.menu_item_id AND venue_id = _venue_id;
  IF _base IS NULL THEN
    RAISE EXCEPTION 'menu_item % does not belong to venue %', NEW.menu_item_id, _venue_id;
  END IF;

  -- "Now" in the venue's timezone (default AU/Sydney if unset).
  SELECT COALESCE(timezone, 'Australia/Sydney') INTO _tz FROM public.venues WHERE id = _venue_id;
  _local := (now() AT TIME ZONE COALESCE(_tz, 'Australia/Sydney'));
  _dow := EXTRACT(DOW FROM _local)::int;
  _minutes := (EXTRACT(HOUR FROM _local) * 60 + EXTRACT(MINUTE FROM _local))::int;

  -- Authoritative price = base with the best (lowest) discount among the pricing
  -- rules that are active AND whose date/day/time window includes "now" in the
  -- venue timezone. Surcharge rules can only lose the MIN against base, so (like
  -- the client's resolvePrice) they never raise the price here.
  SELECT ROUND(MIN(cand), 2) INTO _price FROM (
    SELECT _base AS cand
    UNION ALL
    SELECT GREATEST(0,
      CASE WHEN pr.modifier_type = 'percent'
           THEN _base * (1 + COALESCE(pr.modifier_value, pr.modifier_percent, 0) / 100.0)
           ELSE _base + COALESCE(pr.modifier_value, pr.modifier_percent, 0)
      END)
    FROM public.pricing_rules pr
    WHERE pr.venue_id = _venue_id
      AND COALESCE(pr.is_active, true)
      -- item scope: applies to all items (no link rows) or explicitly linked
      AND (
        NOT EXISTS (SELECT 1 FROM public.pricing_rule_items pri WHERE pri.pricing_rule_id = pr.id)
        OR EXISTS (SELECT 1 FROM public.pricing_rule_items pri
                   WHERE pri.pricing_rule_id = pr.id AND pri.menu_item_id = NEW.menu_item_id)
      )
      -- date window
      AND (pr.start_date IS NULL OR _local::date >= pr.start_date)
      AND (pr.end_date IS NULL OR _local::date <= pr.end_date)
      -- day-of-week (null / empty = every day)
      AND (
        pr.days_of_week IS NULL
        OR array_length(pr.days_of_week, 1) IS NULL
        OR _dow = ANY (pr.days_of_week)
      )
      -- time-of-day window (handles overnight windows where start > end)
      AND (
        (pr.start_time IS NULL AND pr.end_time IS NULL)
        OR (pr.start_time IS NOT NULL AND pr.end_time IS NOT NULL AND (
              (pr.start_time <= pr.end_time
                 AND _minutes >= (EXTRACT(HOUR FROM pr.start_time) * 60 + EXTRACT(MINUTE FROM pr.start_time))
                 AND _minutes <= (EXTRACT(HOUR FROM pr.end_time)   * 60 + EXTRACT(MINUTE FROM pr.end_time)))
              OR (pr.start_time > pr.end_time
                 AND (_minutes >= (EXTRACT(HOUR FROM pr.start_time) * 60 + EXTRACT(MINUTE FROM pr.start_time))
                      OR _minutes <= (EXTRACT(HOUR FROM pr.end_time) * 60 + EXTRACT(MINUTE FROM pr.end_time))))
           ))
        OR (pr.start_time IS NOT NULL AND pr.end_time IS NULL
             AND _minutes >= (EXTRACT(HOUR FROM pr.start_time) * 60 + EXTRACT(MINUTE FROM pr.start_time)))
        OR (pr.start_time IS NULL AND pr.end_time IS NOT NULL
             AND _minutes <= (EXTRACT(HOUR FROM pr.end_time) * 60 + EXTRACT(MINUTE FROM pr.end_time)))
      )
  ) cands;

  -- Overwrite with the server price — the client's unit_price is discarded.
  NEW.unit_price := COALESCE(_price, _base);

  -- Re-derive modifier prices from the authoritative table. Unknown / cross-venue
  -- modifier ids are neutralised to 0 so they cannot alter the order total.
  IF jsonb_typeof(NEW.modifiers) = 'array' THEN
    FOR _elem IN SELECT value FROM jsonb_array_elements(NEW.modifiers) AS value
    LOOP
      IF _elem ? 'modifier_id'
         AND (_elem->>'modifier_id') ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT price INTO _mod_price
        FROM public.modifiers
        WHERE id = (_elem->>'modifier_id')::uuid
          AND venue_id = _venue_id
          AND COALESCE(is_active, true);
        _new_mods := _new_mods || jsonb_build_array(
          jsonb_set(_elem, '{price}', to_jsonb(COALESCE(_mod_price, 0)))
        );
      ELSE
        _new_mods := _new_mods || jsonb_build_array(
          jsonb_set(_elem, '{price}', to_jsonb(0))
        );
      END IF;
    END LOOP;
    NEW.modifiers := _new_mods;
  END IF;

  RETURN NEW;
END;
$$;
