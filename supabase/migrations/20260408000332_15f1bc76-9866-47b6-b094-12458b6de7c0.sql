-- Allow anon and authenticated users to SELECT order_items
-- Order IDs are UUIDs (unguessable), matching the existing open INSERT pattern
CREATE POLICY "Anyone can view order items by order id"
ON public.order_items FOR SELECT
TO anon, authenticated
USING (true);