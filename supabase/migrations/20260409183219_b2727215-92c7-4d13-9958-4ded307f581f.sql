
-- Modifier categories (e.g. "Meat Temperature", "Extras", "Remove Ingredient")
CREATE TABLE public.modifier_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modifier_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view modifier categories" ON public.modifier_categories FOR SELECT TO authenticated USING (is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Admins can view all modifier categories" ON public.modifier_categories FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Managers can insert modifier categories" ON public.modifier_categories FOR INSERT TO authenticated WITH CHECK (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can update modifier categories" ON public.modifier_categories FOR UPDATE TO authenticated USING (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete modifier categories" ON public.modifier_categories FOR DELETE TO authenticated USING (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Admins can insert modifier categories" ON public.modifier_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can update modifier categories" ON public.modifier_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can delete modifier categories" ON public.modifier_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Public can view active modifier categories" ON public.modifier_categories FOR SELECT TO anon USING (is_active = true);

CREATE TRIGGER update_modifier_categories_updated_at BEFORE UPDATE ON public.modifier_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Individual modifiers (e.g. "Rare", "Medium", "No Tomato", "Extra Cheese +$2")
CREATE TABLE public.modifiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.modifier_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view modifiers" ON public.modifiers FOR SELECT TO authenticated USING (is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Admins can view all modifiers" ON public.modifiers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Managers can insert modifiers" ON public.modifiers FOR INSERT TO authenticated WITH CHECK (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can update modifiers" ON public.modifiers FOR UPDATE TO authenticated USING (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete modifiers" ON public.modifiers FOR DELETE TO authenticated USING (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Admins can insert modifiers" ON public.modifiers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can update modifiers" ON public.modifiers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can delete modifiers" ON public.modifiers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Public can view active modifiers" ON public.modifiers FOR SELECT TO anon USING (is_active = true);

CREATE TRIGGER update_modifiers_updated_at BEFORE UPDATE ON public.modifiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Join table: assigns modifier categories to menu items
CREATE TABLE public.menu_item_modifiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  modifier_category_id uuid NOT NULL REFERENCES public.modifier_categories(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, modifier_category_id)
);

ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view menu item modifiers" ON public.menu_item_modifiers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_modifiers.menu_item_id AND is_venue_staff(auth.uid(), mi.venue_id)));
CREATE POLICY "Managers can insert menu item modifiers" ON public.menu_item_modifiers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_modifiers.menu_item_id AND is_venue_manager(auth.uid(), mi.venue_id)));
CREATE POLICY "Managers can update menu item modifiers" ON public.menu_item_modifiers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_modifiers.menu_item_id AND is_venue_manager(auth.uid(), mi.venue_id)));
CREATE POLICY "Managers can delete menu item modifiers" ON public.menu_item_modifiers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_modifiers.menu_item_id AND is_venue_manager(auth.uid(), mi.venue_id)));
CREATE POLICY "Admins can view all menu item modifiers" ON public.menu_item_modifiers FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can insert menu item modifiers" ON public.menu_item_modifiers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can update menu item modifiers" ON public.menu_item_modifiers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can delete menu item modifiers" ON public.menu_item_modifiers FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Public can view menu item modifiers" ON public.menu_item_modifiers FOR SELECT TO anon USING (true);
