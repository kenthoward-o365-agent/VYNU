-- =====================================================================
-- Scaling Phase 1: Vault secrets, queues, breakers, partitioning, TTL
-- =====================================================================

-- ---------- #1. Vault-backed POS secrets ----------------------------
-- Map of provider config_schema "secret" field key -> vault secret_id
ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS secrets_map jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Admin-only RPC: store a credential in vault and record id in secrets_map.
-- Strips the field from `config` so secrets never sit in JSONB.
CREATE OR REPLACE FUNCTION public.set_pos_credential(
  _venue_id uuid,
  _field text,
  _value text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _secret_id uuid;
  _existing uuid;
  _name text;
BEGIN
  IF NOT has_role(auth.uid(), 'tabless_admin'::app_role)
     AND NOT is_venue_manager(auth.uid(), _venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _field IS NULL OR length(_field) = 0 THEN
    RAISE EXCEPTION 'field required';
  END IF;

  _name := 'pos_' || _venue_id::text || '_' || _field;

  -- If a secret already mapped, update it; else create new
  SELECT (secrets_map ->> _field)::uuid INTO _existing
  FROM public.venue_pos_integrations WHERE venue_id = _venue_id;

  IF _existing IS NOT NULL THEN
    PERFORM vault.update_secret(_existing, _value, _name, NULL);
    _secret_id := _existing;
  ELSE
    SELECT vault.create_secret(_value, _name, 'POS credential for venue ' || _venue_id) INTO _secret_id;
  END IF;

  UPDATE public.venue_pos_integrations
  SET secrets_map = secrets_map || jsonb_build_object(_field, _secret_id::text),
      config = config - _field,
      updated_at = now()
  WHERE venue_id = _venue_id;

  RETURN _secret_id;
END;
$$;

-- Service-role only reader (called from edge functions via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.read_pos_credential(_venue_id uuid, _field text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _secret_id uuid;
  _val text;
BEGIN
  -- Only callable with service role / definer chain. Block end users.
  IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'tabless_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT (secrets_map ->> _field)::uuid INTO _secret_id
  FROM public.venue_pos_integrations WHERE venue_id = _venue_id;
  IF _secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO _val FROM vault.decrypted_secrets WHERE id = _secret_id;
  RETURN _val;
END;
$$;

REVOKE ALL ON FUNCTION public.read_pos_credential(uuid, text) FROM public, anon, authenticated;

-- ---------- #4. Circuit breaker state on integrations ---------------
ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS breaker_state text NOT NULL DEFAULT 'closed'
    CHECK (breaker_state IN ('closed','open','half_open')),
  ADD COLUMN IF NOT EXISTS breaker_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breaker_opened_at timestamptz;

-- ---------- #3. Outbound POS job queue -------------------------------
SELECT pgmq.create('jobs_pos_outbound');

CREATE OR REPLACE FUNCTION public.enqueue_pos_job(_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
DECLARE _msg_id bigint;
BEGIN
  IF NOT (has_role(auth.uid(), 'tabless_admin'::app_role)
          OR auth.uid() IS NULL) THEN
    -- allow service role (auth.uid() null) and admins
    IF NOT is_venue_manager(auth.uid(), (_payload->>'venue_id')::uuid) THEN
      RAISE EXCEPTION 'Not authorised';
    END IF;
  END IF;
  SELECT pgmq.send('jobs_pos_outbound', _payload) INTO _msg_id;
  RETURN _msg_id;
END;
$$;

-- Allow workers to dequeue from this queue too.
CREATE OR REPLACE FUNCTION public.dequeue_jobs(_queue text, _vt_seconds integer DEFAULT 60, _qty integer DEFAULT 10)
 RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamp with time zone, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  IF _queue NOT IN ('jobs_loyalty', 'jobs_reports', 'jobs_notifications', 'jobs_pos_outbound') THEN
    RAISE EXCEPTION 'Unknown queue: %', _queue;
  END IF;
  RETURN QUERY
  SELECT q.msg_id, q.read_ct, q.enqueued_at, q.message
  FROM pgmq.read(_queue, _vt_seconds, _qty) q;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ack_job(_queue text, _msg_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  IF _queue NOT IN ('jobs_loyalty', 'jobs_reports', 'jobs_notifications', 'jobs_pos_outbound') THEN
    RAISE EXCEPTION 'Unknown queue: %', _queue;
  END IF;
  RETURN pgmq.delete(_queue, _msg_id);
END;
$function$;

-- ---------- #6. Partition api_request_log + pos_sync_log -------------
-- Convert to monthly RANGE partitioning by created_at.
-- These tables are small in current stage; we re-create and copy.

-- api_request_log
ALTER TABLE public.api_request_log RENAME TO api_request_log_legacy;
ALTER INDEX public.api_request_log_pkey RENAME TO api_request_log_legacy_pkey;
ALTER INDEX public.idx_api_request_log_partner_created RENAME TO idx_api_request_log_legacy_partner_created;

CREATE TABLE public.api_request_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.api_partners(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  latency_ms integer,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_api_request_log_partner_created
  ON public.api_request_log (partner_id, created_at DESC);

ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view request log" ON public.api_request_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tabless_admin'::app_role));

-- Helper to ensure current+next month partitions exist (idempotent)
CREATE OR REPLACE FUNCTION public.ensure_monthly_partition(_parent regclass, _month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _start date := date_trunc('month', _month)::date;
  _end date := (date_trunc('month', _month) + interval '1 month')::date;
  _name text := _parent::text || '_y' || to_char(_start, 'YYYY') || 'm' || to_char(_start, 'MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    _name, _parent::text, _start, _end);
END;
$$;

SELECT public.ensure_monthly_partition('public.api_request_log'::regclass, current_date);
SELECT public.ensure_monthly_partition('public.api_request_log'::regclass, (current_date + interval '1 month')::date);

-- Backfill last 30 days of legacy data
INSERT INTO public.api_request_log
  (id, partner_id, api_key_id, venue_id, method, path, status_code, latency_ms, request_id, created_at)
SELECT id, partner_id, api_key_id, venue_id, method, path, status_code, latency_ms, request_id, created_at
FROM public.api_request_log_legacy
WHERE created_at > now() - interval '30 days';

-- pos_sync_log
ALTER TABLE public.pos_sync_log RENAME TO pos_sync_log_legacy;
ALTER INDEX public.pos_sync_log_pkey RENAME TO pos_sync_log_legacy_pkey;
ALTER INDEX public.idx_pos_sync_log_venue_id RENAME TO idx_pos_sync_log_legacy_venue_id;

CREATE TABLE public.pos_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  payload_hash text,
  result text NOT NULL DEFAULT 'success',
  error_message text,
  items_synced integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_pos_sync_log_venue_id ON public.pos_sync_log (venue_id, created_at DESC);

ALTER TABLE public.pos_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can view sync logs" ON public.pos_sync_log
  FOR SELECT TO authenticated USING (is_venue_manager(auth.uid(), venue_id));
CREATE POLICY "Staff can view sync logs" ON public.pos_sync_log
  FOR SELECT TO authenticated USING (is_venue_staff(auth.uid(), venue_id));
CREATE POLICY "Service can insert sync logs" ON public.pos_sync_log
  FOR INSERT TO authenticated WITH CHECK (true);

SELECT public.ensure_monthly_partition('public.pos_sync_log'::regclass, current_date);
SELECT public.ensure_monthly_partition('public.pos_sync_log'::regclass, (current_date + interval '1 month')::date);

INSERT INTO public.pos_sync_log
  (id, venue_id, event_type, direction, payload_hash, result, error_message, items_synced, created_at)
SELECT id, venue_id, event_type, direction, payload_hash, result, error_message, items_synced, created_at
FROM public.pos_sync_log_legacy
WHERE created_at > now() - interval '30 days';

-- Maintenance: roll partitions monthly + retention (keep 6 months)
CREATE OR REPLACE FUNCTION public.maintain_log_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent text;
  _cutoff date := (date_trunc('month', current_date) - interval '6 months')::date;
  _part record;
BEGIN
  FOREACH _parent IN ARRAY ARRAY['public.api_request_log','public.pos_sync_log'] LOOP
    PERFORM public.ensure_monthly_partition(_parent::regclass, current_date);
    PERFORM public.ensure_monthly_partition(_parent::regclass, (current_date + interval '1 month')::date);
    PERFORM public.ensure_monthly_partition(_parent::regclass, (current_date + interval '2 months')::date);

    FOR _part IN
      SELECT inhrelid::regclass::text AS pname
      FROM pg_inherits
      WHERE inhparent = _parent::regclass
    LOOP
      -- Drop partitions older than cutoff (name pattern: parent_yYYYYmMM)
      IF _part.pname ~ ('_y[0-9]{4}m[0-9]{2}$') THEN
        DECLARE
          _ym text := substring(_part.pname FROM '_y([0-9]{4})m([0-9]{2})$');
        BEGIN
          NULL;
        END;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ---------- #8. Idempotency TTL purge --------------------------------
CREATE OR REPLACE FUNCTION public.purge_api_idempotency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  WITH d AS (
    DELETE FROM public.api_idempotency
    WHERE created_at < now() - interval '24 hours'
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM d;
  RETURN _n;
END;
$$;
