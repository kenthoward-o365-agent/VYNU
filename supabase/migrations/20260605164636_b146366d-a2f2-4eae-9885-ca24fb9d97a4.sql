
-- ========== Drop empty legacy / stale partition tables ==========
DROP TABLE IF EXISTS public.api_request_log_legacy CASCADE;
DROP TABLE IF EXISTS public.pos_sync_log_legacy CASCADE;
DROP TABLE IF EXISTS public.api_request_log_y2026m05 CASCADE;
DROP TABLE IF EXISTS public.pos_sync_log_y2026m05 CASCADE;

-- ========== FK indexes on partitioned parents (propagate to partitions) ==========
CREATE INDEX IF NOT EXISTS idx_api_request_log_venue_id ON public.api_request_log (venue_id);
CREATE INDEX IF NOT EXISTS idx_api_request_log_api_key_id ON public.api_request_log (api_key_id);

-- ========== FK indexes on regular tables ==========
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON public.api_keys (created_by);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_webhook_id ON public.api_webhook_deliveries (webhook_id);
CREATE INDEX IF NOT EXISTS idx_ar_onboarding_tokens_created_by ON public.ar_onboarding_tokens (created_by);
CREATE INDEX IF NOT EXISTS idx_loyalty_program_venue_optouts_venue_id ON public.loyalty_program_venue_optouts (venue_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_time_frames_time_frame_id ON public.menu_item_time_frames (time_frame_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_chat_messages_user_id ON public.onboarding_chat_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_requested_by ON public.order_refunds (requested_by);
CREATE INDEX IF NOT EXISTS idx_order_throttle_log_venue_id ON public.order_throttle_log (venue_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rule_items_menu_item_id ON public.pricing_rule_items (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_host_diner_id ON public.table_sessions (host_diner_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_table_id ON public.table_sessions (table_id);
CREATE INDEX IF NOT EXISTS idx_venue_billing_events_created_by ON public.venue_billing_events (created_by);
CREATE INDEX IF NOT EXISTS idx_venue_credit_notes_created_by ON public.venue_credit_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_venue_credit_notes_invoice_id ON public.venue_credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS idx_venue_dayend_log_venue_id ON public.venue_dayend_log (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_invoices_voided_by ON public.venue_invoices (voided_by);
CREATE INDEX IF NOT EXISTS idx_venue_pos_integrations_provider_id ON public.venue_pos_integrations (provider_id);

-- ========== Tighten ON DELETE rules where missing ==========
-- venue_credit_notes.invoice_id → cascade with the invoice
ALTER TABLE public.venue_credit_notes
  DROP CONSTRAINT IF EXISTS venue_credit_notes_invoice_id_fkey;
ALTER TABLE public.venue_credit_notes
  ADD CONSTRAINT venue_credit_notes_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.venue_invoices(id) ON DELETE CASCADE;

-- venue_pos_integrations.provider_id → RESTRICT (prevent deleting a provider in use)
ALTER TABLE public.venue_pos_integrations
  DROP CONSTRAINT IF EXISTS venue_pos_integrations_provider_id_fkey;
ALTER TABLE public.venue_pos_integrations
  ADD CONSTRAINT venue_pos_integrations_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES public.pos_providers(id) ON DELETE RESTRICT;

-- order_refunds.requested_by → SET NULL if staff user removed
ALTER TABLE public.order_refunds
  DROP CONSTRAINT IF EXISTS order_refunds_requested_by_fkey;
ALTER TABLE public.order_refunds
  ADD CONSTRAINT order_refunds_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- api_keys.created_by → SET NULL
ALTER TABLE public.api_keys
  DROP CONSTRAINT IF EXISTS api_keys_created_by_fkey;
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- venue_invoices.voided_by → SET NULL
ALTER TABLE public.venue_invoices
  DROP CONSTRAINT IF EXISTS venue_invoices_voided_by_fkey;
ALTER TABLE public.venue_invoices
  ADD CONSTRAINT venue_invoices_voided_by_fkey
  FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- venue_billing_events.created_by → SET NULL
ALTER TABLE public.venue_billing_events
  DROP CONSTRAINT IF EXISTS venue_billing_events_created_by_fkey;
ALTER TABLE public.venue_billing_events
  ADD CONSTRAINT venue_billing_events_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
