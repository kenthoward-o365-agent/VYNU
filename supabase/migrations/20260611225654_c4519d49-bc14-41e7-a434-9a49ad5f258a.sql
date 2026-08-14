-- Scope existing CRM policies to authenticated role only (remove anon exposure)
ALTER POLICY "Admins view all suppression" ON public.crm_suppression TO authenticated;
ALTER POLICY "Admins manage venue_crm_config" ON public.venue_crm_config TO authenticated;
ALTER POLICY "Managers manage own venue_crm_config" ON public.venue_crm_config TO authenticated;
ALTER POLICY "Staff view own venue_crm_config" ON public.venue_crm_config TO authenticated;