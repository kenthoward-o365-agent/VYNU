
-- Enum for group staff roles
CREATE TYPE public.group_staff_role AS ENUM ('group_admin', 'group_viewer');

-- Venue groups table
CREATE TABLE public.venue_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  domain text,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_groups ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_venue_groups_updated_at
  BEFORE UPDATE ON public.venue_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Venue group staff table
CREATE TABLE public.venue_group_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.venue_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role group_staff_role NOT NULL DEFAULT 'group_viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.venue_group_staff ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_venue_group_staff_updated_at
  BEFORE UPDATE ON public.venue_group_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add group_id to venues
ALTER TABLE public.venues ADD COLUMN group_id uuid REFERENCES public.venue_groups(id) ON DELETE SET NULL;

-- Helper: is_group_admin
CREATE OR REPLACE FUNCTION public.is_group_admin(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_group_staff
    WHERE user_id = _user_id AND group_id = _group_id AND role = 'group_admin'
  )
$$;

-- Helper: is_group_staff (any role)
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_group_staff
    WHERE user_id = _user_id AND group_id = _group_id
  )
$$;

-- RLS for venue_groups
CREATE POLICY "Group members can view their groups"
  ON public.venue_groups FOR SELECT TO authenticated
  USING (is_group_member(auth.uid(), id));

CREATE POLICY "Group admins can update their groups"
  ON public.venue_groups FOR UPDATE TO authenticated
  USING (is_group_admin(auth.uid(), id));

CREATE POLICY "Authenticated users can create groups"
  ON public.venue_groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Group admins can delete their groups"
  ON public.venue_groups FOR DELETE TO authenticated
  USING (is_group_admin(auth.uid(), id));

-- RLS for venue_group_staff
CREATE POLICY "Group members can view staff"
  ON public.venue_group_staff FOR SELECT TO authenticated
  USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Group admins can manage staff"
  ON public.venue_group_staff FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(auth.uid(), group_id));

CREATE POLICY "Group admins can update staff"
  ON public.venue_group_staff FOR UPDATE TO authenticated
  USING (is_group_admin(auth.uid(), group_id));

CREATE POLICY "Group admins can remove staff"
  ON public.venue_group_staff FOR DELETE TO authenticated
  USING (is_group_admin(auth.uid(), group_id));

-- Allow self-insert for group creators
CREATE POLICY "Users can add themselves as group staff"
  ON public.venue_group_staff FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update venues RLS: group admins can also view/manage venues in their group
CREATE POLICY "Group admins can view group venues"
  ON public.venues FOR SELECT TO authenticated
  USING (group_id IS NOT NULL AND is_group_admin(auth.uid(), group_id));

CREATE POLICY "Group admins can update group venues"
  ON public.venues FOR UPDATE TO authenticated
  USING (group_id IS NOT NULL AND is_group_admin(auth.uid(), group_id));
