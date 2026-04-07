CREATE POLICY "Anyone can check venue payment status"
ON public.venue_payment_config
FOR SELECT
TO anon, authenticated
USING (true);