
-- 1. Extend venue_pos_integrations with sync toggles + last-event timestamps
ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS sync_pos_to_us boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_us_to_pos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_menu_pull_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;

-- 2. Approval queue for our → POS menu pushes
CREATE TABLE IF NOT EXISTS public.pos_menu_change_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  menu_item_id uuid,
  pos_id text,
  change_kind text NOT NULL CHECK (change_kind IN ('update','create','snooze')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','failed','rejected')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pos_menu_change_queue_venue_status
  ON public.pos_menu_change_queue (venue_id, status, created_at DESC);

ALTER TABLE public.pos_menu_change_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view menu change queue"
  ON public.pos_menu_change_queue FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id) OR has_role(auth.uid(),'tabless_admin'::app_role));

CREATE POLICY "Managers manage menu change queue"
  ON public.pos_menu_change_queue FOR ALL TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id) OR has_role(auth.uid(),'tabless_admin'::app_role))
  WITH CHECK (is_venue_manager(auth.uid(), venue_id) OR has_role(auth.uid(),'tabless_admin'::app_role));

-- 3. Webhook event log (idempotency + audit)
CREATE TABLE IF NOT EXISTS public.pos_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  provider_slug text NOT NULL,
  event_id text NOT NULL,
  topic text,
  signature_valid boolean NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  process_error text,
  UNIQUE (provider_slug, event_id)
);
CREATE INDEX IF NOT EXISTS idx_pos_webhook_events_venue
  ON public.pos_webhook_events (venue_id, received_at DESC);

ALTER TABLE public.pos_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view webhook events"
  ON public.pos_webhook_events FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id) OR has_role(auth.uid(),'tabless_admin'::app_role));

-- 4. Update H&L Exceed provider config schema
UPDATE public.pos_providers
SET auth_type = 'hmac',
    capabilities = jsonb_build_object(
      'menu_pull', true,
      'menu_push', true,
      'order_send', true,
      'webhooks', true,
      'approval_queue', true
    ),
    config_schema = '[
      {"key":"organisation_id","type":"text","label":"Organisation ID","required":true,"help":"H&L POS organisation identifier"},
      {"key":"tenant_id","type":"text","label":"Tenant / Venue ID","required":true,"help":"Venue identifier on H&L POS (also called tenantId)"},
      {"key":"location_id","type":"text","label":"Location ID","required":true,"help":"Menu Management location identifier"},
      {"key":"menu_service_base_url","type":"url","label":"Menu Service Base URL","required":true,"placeholder":"https://..."},
      {"key":"subscription_service_base_url","type":"url","label":"Subscription Service Base URL","required":false},
      {"key":"portal_service_url","type":"url","label":"Portal Service URL (on-prem)","required":true,"help":"Venue Portal Service endpoint that receives orders"},
      {"key":"fail_notification_email","type":"text","label":"Failure Notification Email","required":false},
      {"key":"shared_secret","type":"secret","label":"Shared Secret","required":true,"help":"Used to verify HMAC signatures on inbound webhooks"},
      {"key":"service_account_token","type":"secret","label":"Service Account Bearer Token","required":true,"help":"Bearer token for the Menu Management Integrator role"}
    ]'::jsonb,
    status = 'beta',
    is_active = true,
    updated_at = now()
WHERE slug = 'hl_exceed';
