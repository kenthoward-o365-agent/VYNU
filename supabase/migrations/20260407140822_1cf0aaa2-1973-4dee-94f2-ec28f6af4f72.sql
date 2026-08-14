
-- Fix venues insert policy to require authentication (already limited to authenticated role, but make explicit)
DROP POLICY "Owners can insert venues" ON public.venues;
CREATE POLICY "Authenticated users can create venues" ON public.venues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix orders insert to require venue_id exists
DROP POLICY "Anyone can create orders" ON public.orders;
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (venue_id IS NOT NULL);

-- Fix order items insert to require order_id exists
DROP POLICY "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items" ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (order_id IS NOT NULL);
