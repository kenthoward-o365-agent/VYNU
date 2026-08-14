
CREATE TABLE public.venue_billing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE UNIQUE,
  commission_percent numeric NOT NULL DEFAULT 0,
  min_monthly_fee numeric NOT NULL DEFAULT 0,
  billing_currency text NOT NULL DEFAULT 'AUD',
  inherit_from_group boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_billing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view billing config" ON public.venue_billing_config
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can insert billing config" ON public.venue_billing_config
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can update billing config" ON public.venue_billing_config
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can delete billing config" ON public.venue_billing_config
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE TRIGGER update_venue_billing_config_updated_at
  BEFORE UPDATE ON public.venue_billing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
