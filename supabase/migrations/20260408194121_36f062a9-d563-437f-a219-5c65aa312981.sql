-- Allow authenticated users to view active loyalty programs (for diner enrollment)
CREATE POLICY "Authenticated users can view active loyalty programs"
ON public.loyalty_programs
FOR SELECT
TO authenticated
USING (is_active = true);