
-- Enum: strict separation between POS and CRM partners
CREATE TYPE public.api_partner_type AS ENUM ('pos', 'crm');

-- Enable pgcrypto for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Partners
CREATE TABLE public.api_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  partner_type public.api_partner_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage api_partners" ON public.api_partners
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));
CREATE TRIGGER update_api_partners_updated_at
  BEFORE UPDATE ON public.api_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. API Keys (hashed; full key shown to user only at creation)
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.api_partners(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  key_prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_partner ON public.api_keys(partner_id);
CREATE INDEX idx_api_keys_venue ON public.api_keys(venue_id);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage api_keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));

-- 3. Webhooks
CREATE TABLE public.api_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.api_partners(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_delivery_at timestamptz,
  last_delivery_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_webhooks_partner ON public.api_webhooks(partner_id);
CREATE INDEX idx_api_webhooks_venue ON public.api_webhooks(venue_id);
ALTER TABLE public.api_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage api_webhooks" ON public.api_webhooks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));
CREATE TRIGGER update_api_webhooks_updated_at
  BEFORE UPDATE ON public.api_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Webhook deliveries (audit + retry queue)
CREATE TABLE public.api_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.api_webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_pending ON public.api_webhook_deliveries(next_retry_at)
  WHERE delivered_at IS NULL;
ALTER TABLE public.api_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view webhook deliveries" ON public.api_webhook_deliveries
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- 5. Idempotency cache
CREATE TABLE public.api_idempotency (
  partner_id uuid NOT NULL REFERENCES public.api_partners(id) ON DELETE CASCADE,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, key)
);
CREATE INDEX idx_api_idempotency_created ON public.api_idempotency(created_at);
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view idempotency" ON public.api_idempotency
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- 6. Request log
CREATE TABLE public.api_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.api_partners(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  latency_ms integer,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_request_log_partner_created ON public.api_request_log(partner_id, created_at DESC);
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view api_request_log" ON public.api_request_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- 7. menu_items.snooze_until for POS snooze endpoint
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS snooze_until timestamptz;

-- 8. verify_api_key function: looks up partner by prefix, verifies SHA-256 hash
CREATE OR REPLACE FUNCTION public.verify_api_key(_prefix text, _full_key text)
RETURNS TABLE (
  partner_id uuid,
  key_id uuid,
  venue_id uuid,
  partner_type public.api_partner_type,
  scopes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expected_hash text;
BEGIN
  _expected_hash := encode(digest(_full_key, 'sha256'), 'hex');

  RETURN QUERY
  SELECT k.partner_id, k.id, k.venue_id, p.partner_type, k.scopes
  FROM public.api_keys k
  JOIN public.api_partners p ON p.id = k.partner_id
  WHERE k.key_prefix = _prefix
    AND k.key_hash = _expected_hash
    AND k.revoked_at IS NULL
    AND p.is_active = true;

  -- Touch last_used_at (best-effort)
  UPDATE public.api_keys SET last_used_at = now()
  WHERE key_prefix = _prefix AND key_hash = _expected_hash;
END;
$$;
