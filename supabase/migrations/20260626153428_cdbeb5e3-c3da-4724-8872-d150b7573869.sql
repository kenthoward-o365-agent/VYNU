
CREATE TABLE IF NOT EXISTS public.sms_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'receipt',
  last_order_id UUID,
  diner_profile_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opted_in_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  receipt_send_count INT NOT NULL DEFAULT 0,
  last_receipt_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_sms_subscribers_venue ON public.sms_subscribers(venue_id);
CREATE INDEX IF NOT EXISTS idx_sms_subscribers_opt_in
  ON public.sms_subscribers(venue_id) WHERE marketing_opt_in = true AND unsubscribed_at IS NULL;

GRANT SELECT, UPDATE, DELETE ON public.sms_subscribers TO authenticated;
GRANT ALL ON public.sms_subscribers TO service_role;

ALTER TABLE public.sms_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_subscribers_select_staff"
  ON public.sms_subscribers FOR SELECT
  TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "sms_subscribers_update_manager"
  ON public.sms_subscribers FOR UPDATE
  TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "sms_subscribers_delete_manager"
  ON public.sms_subscribers FOR DELETE
  TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

CREATE TRIGGER trg_sms_subscribers_updated_at
  BEFORE UPDATE ON public.sms_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
