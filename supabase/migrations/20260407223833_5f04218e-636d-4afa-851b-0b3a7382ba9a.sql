CREATE POLICY "Authenticated users can view tables"
ON public.tables
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view active categories"
ON public.menu_categories
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Authenticated users can view all menu items"
ON public.menu_items
FOR SELECT
TO authenticated
USING (true);