
CREATE TABLE public.diner_stored_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diner_id uuid NOT NULL REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'adyen',
  token_reference text NOT NULL,
  shopper_reference text NOT NULL,
  card_summary text,
  card_brand text,
  expiry_month text,
  expiry_year text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.diner_stored_cards ENABLE ROW LEVEL SECURITY;

-- Diners can view their own stored cards
CREATE POLICY "Diners can view own stored cards"
  ON public.diner_stored_cards FOR SELECT TO authenticated
  USING (diner_id = get_user_diner_profile_id());

-- Diners can insert their own stored cards
CREATE POLICY "Diners can insert own stored cards"
  ON public.diner_stored_cards FOR INSERT TO authenticated
  WITH CHECK (diner_id = get_user_diner_profile_id());

-- Diners can delete their own stored cards
CREATE POLICY "Diners can delete own stored cards"
  ON public.diner_stored_cards FOR DELETE TO authenticated
  USING (diner_id = get_user_diner_profile_id());

-- Diners can update own stored cards (e.g. set default)
CREATE POLICY "Diners can update own stored cards"
  ON public.diner_stored_cards FOR UPDATE TO authenticated
  USING (diner_id = get_user_diner_profile_id());

-- Admins full access
CREATE POLICY "Admins can view all stored cards"
  ON public.diner_stored_cards FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- Allow anonymous inserts via edge function (service role handles this)
-- No anon policy needed as edge function uses service role

CREATE TRIGGER update_diner_stored_cards_updated_at
  BEFORE UPDATE ON public.diner_stored_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_diner_stored_cards_diner ON public.diner_stored_cards(diner_id);
CREATE INDEX idx_diner_stored_cards_venue ON public.diner_stored_cards(venue_id);
