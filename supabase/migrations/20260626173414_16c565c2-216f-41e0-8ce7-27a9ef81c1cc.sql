ALTER TABLE public.crm_campaigns
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'segment';

ALTER TABLE public.crm_campaigns
  DROP CONSTRAINT IF EXISTS crm_campaigns_audience_type_check;
ALTER TABLE public.crm_campaigns
  ADD CONSTRAINT crm_campaigns_audience_type_check
  CHECK (audience_type IN ('segment','sms_subscribers'));