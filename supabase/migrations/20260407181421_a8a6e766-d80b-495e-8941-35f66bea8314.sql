
-- Add name and country_code fields to diner_profiles
ALTER TABLE public.diner_profiles
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS country_code text DEFAULT '+61';

-- Allow anon users to read active loyalty programs (for signup enrollment)
CREATE POLICY "Public can view active loyalty programs"
ON public.loyalty_programs
FOR SELECT
TO anon
USING (is_active = true);

-- Allow authenticated users to insert their own loyalty balances (self-enrollment)
CREATE POLICY "Diners can enrol themselves"
ON public.loyalty_balances
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM diner_profiles dp
    WHERE dp.id = loyalty_balances.diner_id AND dp.user_id = auth.uid()
  )
);
