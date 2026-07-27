-- HLRDRNW-68 · IVA-01 — Server-side enforcement of order pricing.
--
-- Before this migration the consumer app inserted orders.total and
-- order_items.unit_price (plus per-line modifier prices) directly, and RLS
-- validated only who/where — never the money. A diner could therefore place an
-- order for any item at an arbitrary price (e.g. $0.01) and, because Adyen was
-- charged the client-supplied `amount`, actually pay it.
--
-- These triggers make the price/total server-authoritative regardless of what
-- the client sends. The consumer checkout (CheckoutPanel.tsx) is the only
-- code path that inserts order_items, so this does not affect any staff/POS
-- flow.

-- ── 1. Re-price each order_item line on insert ───────────────────────────────
-- Overwrites nothing that is legitimate: it only rejects a unit_price that is
-- BELOW the most-generous price the item could ever have under an active
-- pricing rule (schedule-independent, so a rule-discounted client price is
-- never rejected even if the diner's clock/timezone differs from the venue's),
-- and it re-derives every modifier price from the authoritative `modifiers`
-- table so a client cannot inject a fake/negative/inflated modifier cost.
CREATE OR REPLACE FUNCTION public.enforce_order_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _venue_id uuid;
  _base numeric;
  _floor numeric;
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

  -- Permissive floor = base price with the single best (lowest) active pricing
  -- rule applied. Surcharge rules only raise the price, so they never lower the
  -- floor. If the venue has no rules the floor is simply the base price.
  SELECT MIN(cand) INTO _floor FROM (
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
      AND (
        NOT EXISTS (SELECT 1 FROM public.pricing_rule_items pri
                    WHERE pri.pricing_rule_id = pr.id)
        OR EXISTS (SELECT 1 FROM public.pricing_rule_items pri
                   WHERE pri.pricing_rule_id = pr.id
                     AND pri.menu_item_id = NEW.menu_item_id)
      )
  ) cands;

  IF NEW.unit_price IS NULL OR NEW.unit_price < _floor - 0.01 THEN
    RAISE EXCEPTION
      'order_items.unit_price % is below the minimum allowed price % for menu_item %',
      NEW.unit_price, _floor, NEW.menu_item_id;
  END IF;

  -- Re-derive modifier prices from the authoritative table. Unknown or
  -- cross-venue modifier ids are neutralised to 0 so they cannot alter the
  -- order total; a matched modifier takes the venue's real (possibly 0) price.
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

DROP TRIGGER IF EXISTS trg_enforce_order_item_pricing ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_pricing
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_pricing();

-- ── 2. Clamp gratuity to a non-negative value ────────────────────────────────
-- A negative gratuity would otherwise be a back-door to reduce orders.total.
CREATE OR REPLACE FUNCTION public.clamp_order_gratuity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.gratuity_amount := GREATEST(0, COALESCE(NEW.gratuity_amount, 0));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clamp_order_gratuity ON public.orders;
CREATE TRIGGER trg_clamp_order_gratuity
  BEFORE INSERT OR UPDATE OF gratuity_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.clamp_order_gratuity();

-- ── 3. Recompute orders.total from the server-priced line items ──────────────
-- Runs after each order_item insert; the total is derived from authoritative
-- unit_price + modifier prices, so the client-supplied total is discarded.
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders o
  SET total = COALESCE((
      SELECT SUM(
        (oi.unit_price + COALESCE((
          SELECT SUM((m.value->>'price')::numeric)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(oi.modifiers) = 'array'
                 THEN oi.modifiers ELSE '[]'::jsonb END
          ) AS m(value)
        ), 0)) * oi.quantity
      )
      FROM public.order_items oi
      WHERE oi.order_id = NEW.order_id
    ), 0) + GREATEST(0, COALESCE(o.gratuity_amount, 0))
  WHERE o.id = NEW.order_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_order_total ON public.order_items;
CREATE TRIGGER trg_recompute_order_total
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total();
