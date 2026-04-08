CREATE POLICY "Diners can insert own visits"
ON public.diner_visits FOR INSERT
TO authenticated
WITH CHECK (diner_id = get_user_diner_profile_id());