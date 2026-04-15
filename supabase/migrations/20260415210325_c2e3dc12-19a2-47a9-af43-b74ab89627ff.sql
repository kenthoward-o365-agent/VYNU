-- Extend venue_pos_integrations with OrdrUp API fields
ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS location_id text,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS client_secret_ref text,
  ADD COLUMN IF NOT EXISTS token_cache jsonb;

-- Extend menu_items with POS sync fields
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS plu text,
  ADD COLUMN IF NOT EXISTS pos_allergens integer[],
  ADD COLUMN IF NOT EXISTS pos_tags text[];

-- Extend menu_categories with POS sort order
ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- Create pos_sync_log table
CREATE TABLE public.pos_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  payload_hash text,
  result text NOT NULL DEFAULT 'success',
  error_message text,
  items_synced integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pos_sync_log ENABLE ROW LEVEL SECURITY;

-- Staff can view sync logs for their venue
CREATE POLICY "Staff can view sync logs"
  ON public.pos_sync_log
  FOR SELECT
  TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

-- Managers can view sync logs
CREATE POLICY "Managers can view sync logs"
  ON public.pos_sync_log
  FOR SELECT
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

-- Service role inserts (edge functions use service role key)
-- No INSERT policy needed for authenticated users since edge functions use service_role

-- Index for efficient lookups
CREATE INDEX idx_pos_sync_log_venue_id ON public.pos_sync_log(venue_id, created_at DESC);
CREATE INDEX idx_menu_items_plu ON public.menu_items(venue_id, plu) WHERE plu IS NOT NULL;
CREATE INDEX idx_venue_pos_integrations_location ON public.venue_pos_integrations(location_id) WHERE location_id IS NOT NULL;