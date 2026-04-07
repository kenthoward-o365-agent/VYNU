
CREATE TABLE public.venue_payment_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'adyen',
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
  api_key_test text,
  api_key_live text,
  merchant_account text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (venue_id, provider)
);

ALTER TABLE public.venue_payment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view payment config"
  ON public.venue_payment_config FOR SELECT TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can insert payment config"
  ON public.venue_payment_config FOR INSERT TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update payment config"
  ON public.venue_payment_config FOR UPDATE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can delete payment config"
  ON public.venue_payment_config FOR DELETE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Admins can view all payment configs"
  ON public.venue_payment_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can insert payment configs"
  ON public.venue_payment_config FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can update payment configs"
  ON public.venue_payment_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Admins can delete payment configs"
  ON public.venue_payment_config FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Group admins can view group venue payment configs"
  ON public.venue_payment_config FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM venues v
    WHERE v.id = venue_payment_config.venue_id
    AND v.group_id IS NOT NULL
    AND is_group_admin(auth.uid(), v.group_id)
  ));

CREATE POLICY "Group admins can update group venue payment configs"
  ON public.venue_payment_config FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM venues v
    WHERE v.id = venue_payment_config.venue_id
    AND v.group_id IS NOT NULL
    AND is_group_admin(auth.uid(), v.group_id)
  ));

CREATE TRIGGER update_venue_payment_config_updated_at
  BEFORE UPDATE ON public.venue_payment_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
