CREATE POLICY "Authenticated users can view active venues"
ON public.venues
FOR SELECT
TO authenticated
USING (is_active = true);