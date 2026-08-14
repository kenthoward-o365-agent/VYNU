DROP POLICY IF EXISTS "Diners can view own orders" ON public.orders;

CREATE POLICY "Diners can view own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()
  OR customer_id = public.get_user_diner_profile_id()
);