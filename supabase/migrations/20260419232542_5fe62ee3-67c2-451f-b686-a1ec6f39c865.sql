-- 1. venue_display_areas table
CREATE TABLE public.venue_display_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3B82F6',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

CREATE INDEX idx_venue_display_areas_venue ON public.venue_display_areas(venue_id);

ALTER TABLE public.venue_display_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view display areas"
  ON public.venue_display_areas FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Public can view active display areas"
  ON public.venue_display_areas FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "Managers can insert display areas"
  ON public.venue_display_areas FOR INSERT TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update display areas"
  ON public.venue_display_areas FOR UPDATE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete display areas"
  ON public.venue_display_areas FOR DELETE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER update_venue_display_areas_updated_at
  BEFORE UPDATE ON public.venue_display_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed defaults for new venues
CREATE OR REPLACE FUNCTION public.seed_venue_display_areas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.venue_display_areas (venue_id, name, description, color, display_order, is_default) VALUES
    (NEW.id, 'Kitchen',  'Hot kitchen line',           '#F59E0B', 0, true),
    (NEW.id, 'Bar',      'Drinks and bar service',      '#8B5CF6', 1, false),
    (NEW.id, 'Take Away','Take away / pickup window',   '#10B981', 2, false),
    (NEW.id, 'Expo',     'Expo / pass — final plating', '#3B82F6', 3, false)
  ON CONFLICT (venue_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_venue_display_areas
  AFTER INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.seed_venue_display_areas();

-- Backfill existing venues
INSERT INTO public.venue_display_areas (venue_id, name, description, color, display_order, is_default)
SELECT v.id, x.name, x.description, x.color, x.display_order, x.is_default
FROM public.venues v
CROSS JOIN (VALUES
  ('Kitchen',  'Hot kitchen line',           '#F59E0B', 0, true),
  ('Bar',      'Drinks and bar service',      '#8B5CF6', 1, false),
  ('Take Away','Take away / pickup window',   '#10B981', 2, false),
  ('Expo',     'Expo / pass — final plating', '#3B82F6', 3, false)
) AS x(name, description, color, display_order, is_default)
ON CONFLICT (venue_id, name) DO NOTHING;

-- 3. menu_category_display_areas junction
CREATE TABLE public.menu_category_display_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  display_area_id uuid NOT NULL REFERENCES public.venue_display_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, display_area_id)
);

CREATE INDEX idx_mcda_category ON public.menu_category_display_areas(category_id);
CREATE INDEX idx_mcda_area ON public.menu_category_display_areas(display_area_id);

ALTER TABLE public.menu_category_display_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view category display areas"
  ON public.menu_category_display_areas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_categories mc WHERE mc.id = category_id AND is_venue_staff(auth.uid(), mc.venue_id)));

CREATE POLICY "Public can view category display areas"
  ON public.menu_category_display_areas FOR SELECT TO anon
  USING (true);

CREATE POLICY "Managers can insert category display areas"
  ON public.menu_category_display_areas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM menu_categories mc WHERE mc.id = category_id AND is_venue_manager(auth.uid(), mc.venue_id)));

CREATE POLICY "Managers can delete category display areas"
  ON public.menu_category_display_areas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_categories mc WHERE mc.id = category_id AND is_venue_manager(auth.uid(), mc.venue_id)));

-- 3a. Cap of 3 per category
CREATE OR REPLACE FUNCTION public.enforce_max_3_category_areas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.menu_category_display_areas WHERE category_id = NEW.category_id) >= 3 THEN
    RAISE EXCEPTION 'A category can be assigned to at most 3 display areas';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_max_3_category_areas
  BEFORE INSERT ON public.menu_category_display_areas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_3_category_areas();

-- 4. menu_item_display_areas junction
CREATE TABLE public.menu_item_display_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  display_area_id uuid NOT NULL REFERENCES public.venue_display_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, display_area_id)
);

CREATE INDEX idx_mida_item ON public.menu_item_display_areas(menu_item_id);
CREATE INDEX idx_mida_area ON public.menu_item_display_areas(display_area_id);

ALTER TABLE public.menu_item_display_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view item display areas"
  ON public.menu_item_display_areas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND is_venue_staff(auth.uid(), mi.venue_id)));

CREATE POLICY "Public can view item display areas"
  ON public.menu_item_display_areas FOR SELECT TO anon
  USING (true);

CREATE POLICY "Managers can insert item display areas"
  ON public.menu_item_display_areas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND is_venue_manager(auth.uid(), mi.venue_id)));

CREATE POLICY "Managers can delete item display areas"
  ON public.menu_item_display_areas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND is_venue_manager(auth.uid(), mi.venue_id)));

-- 4a. Cap of 3 per item
CREATE OR REPLACE FUNCTION public.enforce_max_3_item_areas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.menu_item_display_areas WHERE menu_item_id = NEW.menu_item_id) >= 3 THEN
    RAISE EXCEPTION 'An item can be assigned to at most 3 display areas';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_max_3_item_areas
  BEFORE INSERT ON public.menu_item_display_areas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_3_item_areas();