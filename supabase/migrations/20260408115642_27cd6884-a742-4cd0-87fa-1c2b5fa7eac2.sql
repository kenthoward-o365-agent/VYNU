CREATE POLICY "Admins can view all loyalty programs"
ON public.loyalty_programs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can create loyalty programs"
ON public.loyalty_programs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can update loyalty programs"
ON public.loyalty_programs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'))
WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "Admins can delete loyalty programs"
ON public.loyalty_programs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'tabless_admin'));