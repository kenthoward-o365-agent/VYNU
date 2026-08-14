DROP POLICY "Public can view available items" ON public.menu_items;

CREATE POLICY "Public can view all items"
ON public.menu_items
FOR SELECT
TO anon
USING (true);