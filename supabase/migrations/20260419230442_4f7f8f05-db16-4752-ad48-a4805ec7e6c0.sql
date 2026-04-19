ALTER TABLE public.venue_payment_config
  ADD COLUMN IF NOT EXISTS client_key_test text,
  ADD COLUMN IF NOT EXISTS client_key_live text,
  ADD COLUMN IF NOT EXISTS hmac_key text,
  ADD COLUMN IF NOT EXISTS apple_pay_merchant_id text,
  ADD COLUMN IF NOT EXISTS google_pay_merchant_id text,
  ADD COLUMN IF NOT EXISTS capture_mode text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS statement_descriptor text,
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'AUD',
  ADD COLUMN IF NOT EXISTS merchant_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS merchant_id_ordrpay text;

ALTER TABLE public.venue_payment_config
  DROP CONSTRAINT IF EXISTS venue_payment_config_capture_mode_check;
ALTER TABLE public.venue_payment_config
  ADD CONSTRAINT venue_payment_config_capture_mode_check
  CHECK (capture_mode IN ('immediate', 'manual'));

ALTER TABLE public.venue_payment_config
  DROP CONSTRAINT IF EXISTS venue_payment_config_merchant_status_check;
ALTER TABLE public.venue_payment_config
  ADD CONSTRAINT venue_payment_config_merchant_status_check
  CHECK (merchant_status IN ('pending', 'under_review', 'approved', 'suspended'));