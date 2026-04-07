
-- Create venue staff role enum
CREATE TYPE public.venue_staff_role AS ENUM ('owner', 'manager', 'staff');

-- Create order status enum
CREATE TYPE public.order_status AS ENUM ('received', 'preparing', 'ready', 'served', 'paid', 'cancelled');

-- Create pricing rule type enum
CREATE TYPE public.pricing_rule_type AS ENUM ('happy_hour', 'late_night', 'special', 'event', 'weather');

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==================== VENUES ====================
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  venue_type TEXT NOT NULL DEFAULT 'restaurant',
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'NSW',
  postcode TEXT,
  country TEXT DEFAULT 'AU',
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  operating_hours JSONB DEFAULT '{}',
  timezone TEXT DEFAULT 'Australia/Sydney',
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== VENUE STAFF ====================
CREATE TABLE public.venue_staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role venue_staff_role NOT NULL DEFAULT 'staff',
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, user_id)
);
ALTER TABLE public.venue_staff ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_venue_staff_updated_at BEFORE UPDATE ON public.venue_staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: check if user is staff of a venue
CREATE OR REPLACE FUNCTION public.is_venue_staff(_user_id UUID, _venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_staff
    WHERE user_id = _user_id AND venue_id = _venue_id AND is_active = true
  )
$$;

-- Helper: check if user is owner/manager of a venue
CREATE OR REPLACE FUNCTION public.is_venue_manager(_user_id UUID, _venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_staff
    WHERE user_id = _user_id AND venue_id = _venue_id AND role IN ('owner', 'manager') AND is_active = true
  )
$$;

-- ==================== MENU CATEGORIES ====================
CREATE TABLE public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== MENU ITEMS ====================
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  prep_time_minutes INT,
  allergens TEXT[] DEFAULT '{}',
  dietary_tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  food_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== TABLES ====================
CREATE TABLE public.tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  zone TEXT,
  capacity INT DEFAULT 4,
  qr_code TEXT,
  status TEXT DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, table_number)
);
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON public.tables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== ORDERS ====================
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  status order_status NOT NULL DEFAULT 'received',
  total DECIMAL(10,2) DEFAULT 0,
  customer_notes TEXT,
  customer_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== ORDER ITEMS ====================
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  modifiers JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ==================== PRICING RULES ====================
CREATE TABLE public.pricing_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type pricing_rule_type NOT NULL,
  modifier_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  start_time TIME,
  end_time TIME,
  start_date DATE,
  end_date DATE,
  days_of_week INT[] DEFAULT '{0,1,2,3,4,5,6}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_pricing_rules_updated_at BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== RLS POLICIES ====================

-- Venues: staff can view their venues, owners can manage
CREATE POLICY "Staff can view their venues" ON public.venues FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), id));
CREATE POLICY "Owners can insert venues" ON public.venues FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Managers can update venues" ON public.venues FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), id));

-- Venue staff: staff can view their coworkers, managers can manage
CREATE POLICY "Staff can view venue staff" ON public.venue_staff FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Staff can insert themselves" ON public.venue_staff FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Managers can update staff" ON public.venue_staff FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete staff" ON public.venue_staff FOR DELETE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- Menu categories: staff can view, managers can manage
CREATE POLICY "Staff can view categories" ON public.menu_categories FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Managers can insert categories" ON public.menu_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can update categories" ON public.menu_categories FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete categories" ON public.menu_categories FOR DELETE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- Menu items: staff can view, managers can manage; public can view available items
CREATE POLICY "Staff can view all items" ON public.menu_items FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Managers can insert items" ON public.menu_items FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can update items" ON public.menu_items FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete items" ON public.menu_items FOR DELETE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Public can view available items" ON public.menu_items FOR SELECT TO anon
  USING (is_available = true);

-- Tables: staff can view, managers can manage
CREATE POLICY "Staff can view tables" ON public.tables FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Managers can insert tables" ON public.tables FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can update tables" ON public.tables FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete tables" ON public.tables FOR DELETE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- Orders: staff can view/manage venue orders, anon can create
CREATE POLICY "Staff can view venue orders" ON public.orders FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Order items: staff can view, anyone can insert
CREATE POLICY "Staff can view order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_venue_staff(auth.uid(), o.venue_id)));
CREATE POLICY "Anyone can insert order items" ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Pricing rules: staff can view, managers can manage
CREATE POLICY "Staff can view pricing rules" ON public.pricing_rules FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Managers can insert pricing rules" ON public.pricing_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can update pricing rules" ON public.pricing_rules FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Managers can delete pricing rules" ON public.pricing_rules FOR DELETE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

-- ==================== INDEXES ====================
CREATE INDEX idx_venue_staff_user ON public.venue_staff(user_id);
CREATE INDEX idx_venue_staff_venue ON public.venue_staff(venue_id);
CREATE INDEX idx_menu_items_venue ON public.menu_items(venue_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
CREATE INDEX idx_orders_venue ON public.orders(venue_id);
CREATE INDEX idx_orders_table ON public.orders(table_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_tables_venue ON public.tables(venue_id);
CREATE INDEX idx_pricing_rules_venue ON public.pricing_rules(venue_id);
