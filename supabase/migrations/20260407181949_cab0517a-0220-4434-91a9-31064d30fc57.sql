
-- Create SECURITY DEFINER function to get diner profile id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_diner_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM diner_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_diner_profile_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_diner_profile_id TO authenticated;

-- Fix diner_visits policies that query diner_profiles
DROP POLICY IF EXISTS "Diners can view own visits" ON public.diner_visits;
CREATE POLICY "Diners can view own visits"
ON public.diner_visits
FOR SELECT
TO authenticated
USING (diner_id = public.get_user_diner_profile_id());

-- Fix loyalty_balances policies that query diner_profiles
DROP POLICY IF EXISTS "Diners can view own balances" ON public.loyalty_balances;
CREATE POLICY "Diners can view own balances"
ON public.loyalty_balances
FOR SELECT
TO authenticated
USING (diner_id = public.get_user_diner_profile_id());

DROP POLICY IF EXISTS "Diners can enrol themselves" ON public.loyalty_balances;
CREATE POLICY "Diners can enrol themselves"
ON public.loyalty_balances
FOR INSERT
TO authenticated
WITH CHECK (diner_id = public.get_user_diner_profile_id());
