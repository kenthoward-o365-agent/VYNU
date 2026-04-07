
# Tab-Less Admin Panel

## Database Changes (Migration)

### 1. `user_roles` table (per security guidelines)
```sql
CREATE TYPE public.app_role AS ENUM ('tabless_admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Only admins can view/manage roles
CREATE POLICY "Admins can view roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'));
```

### 2. Add subscription fields to `venues`
```sql
ALTER TABLE public.venues 
  ADD COLUMN subscription_status TEXT DEFAULT 'trial',
  ADD COLUMN subscription_plan TEXT DEFAULT 'basic',
  ADD COLUMN subscription_notes TEXT;
```

### 3. RLS policies for admin access
- Admins can SELECT, UPDATE all venues
- Admins can SELECT all venue_staff, diner_profiles, etc.
- Admins can INSERT into auth (via edge function for user creation)

## New Files

### `src/pages/AdminVenues.tsx` — Main admin page
- **Venues list** with search, filter by status (trial/active/suspended)
- **Create venue** dialog: name, type, city, state, parent/child toggle (assign to group)
- **Venue detail** inline panel or click-to-expand with:
  - Subscription status toggle (trial → active → suspended)
  - Subscription plan selector
  - Quick links to manage menu & users for that venue

### `src/pages/AdminVenueDetail.tsx` — Single venue management
- Tabs: **Details**, **Menu**, **Users**
- **Details**: edit venue info, subscription status/plan
- **Menu**: category + item creation (reuse existing Menu Builder logic but operating on any venue_id)
- **Users**: list staff, create new admin user for the venue (calls an edge function to create auth user + venue_staff record)

### `supabase/functions/admin-create-user/index.ts` — Edge function
- Accepts: email, password, venue_id, role, display_name
- Validates caller is tabless_admin
- Creates auth user via admin API
- Creates venue_staff record
- Returns the new user info

## Sidebar Changes (`DashboardLayout.tsx`)
- Add admin nav section (below Group section), visible only when `has_role(uid, 'tabless_admin')` returns true
- Items: "Manage Venues" → `/admin/venues`

## Files to create:
- `src/pages/AdminVenues.tsx`
- `src/pages/AdminVenueDetail.tsx`  
- `supabase/functions/admin-create-user/index.ts`

## Files to edit:
- `src/components/DashboardLayout.tsx` — add admin nav section
- `src/App.tsx` — add admin routes
- `src/contexts/VenueContext.tsx` — expose `isTablessAdmin` flag

## Flow:
1. Tab-Less admin logs in → sees "Admin" section in sidebar
2. Clicks "Manage Venues" → sees all venues across the platform
3. Can create new venues, assign to parent groups, set subscription status
4. Can drill into a venue to create menu items and staff accounts
