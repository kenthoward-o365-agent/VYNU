
-- Allow anonymous users to view basic venue info (for consumer ordering)
CREATE POLICY "Public can view venue info"
ON public.venues
FOR SELECT
TO anon
USING (is_active = true);

-- Allow anonymous users to view tables (for consumer ordering)
CREATE POLICY "Public can view tables"
ON public.tables
FOR SELECT
TO anon
USING (true);

-- Allow anonymous users to view active menu categories
CREATE POLICY "Public can view active categories"
ON public.menu_categories
FOR SELECT
TO anon
USING (is_active = true);
