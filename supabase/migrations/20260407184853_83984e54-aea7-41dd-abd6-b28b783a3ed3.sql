
-- Create admin role enum
CREATE TYPE public.app_role AS ENUM ('tabless_admin');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: Admins can view all roles
CREATE POLICY "Admins can view roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- RLS: Admins can insert roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

-- RLS: Admins can delete roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Add subscription fields to venues
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_notes TEXT;

-- Admin policies for venues: admins can view all venues
CREATE POLICY "Admins can view all venues"
ON public.venues FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for venues: admins can update all venues
CREATE POLICY "Admins can update all venues"
ON public.venues FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for venue_staff: admins can view all staff
CREATE POLICY "Admins can view all staff"
ON public.venue_staff FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for venue_staff: admins can insert staff
CREATE POLICY "Admins can insert staff"
ON public.venue_staff FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for venue_staff: admins can update staff
CREATE POLICY "Admins can update staff"
ON public.venue_staff FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for diner_profiles: admins can view all
CREATE POLICY "Admins can view all diners"
ON public.diner_profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for venue_groups: admins can view all groups
CREATE POLICY "Admins can view all groups"
ON public.venue_groups FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for venue_groups: admins can update all groups
CREATE POLICY "Admins can update all groups"
ON public.venue_groups FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for menu_categories: admins can manage all
CREATE POLICY "Admins can view all categories"
ON public.menu_categories FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can insert categories"
ON public.menu_categories FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can update categories"
ON public.menu_categories FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can delete categories"
ON public.menu_categories FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

-- Admin policies for menu_items: admins can manage all
CREATE POLICY "Admins can view all items"
ON public.menu_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can insert items"
ON public.menu_items FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can update items"
ON public.menu_items FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can delete items"
ON public.menu_items FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));
