-- HLRDRNW-29: reliable order delivery to Exceed.
--
-- Adds the four things the retry loop was missing:
--   1. set_job_vt()               -- lets the worker choose the next retry delay
--                                    (exponential backoff) instead of pgmq's fixed
--                                    visibility timeout.
--   2. pos_outbound_job_state     -- a real attempt counter. pgmq's read_ct counts
--                                    *reads*, so a job deferred because the circuit
--                                    breaker is open burned an attempt without ever
--                                    contacting the POS. Retry budget now counts only
--                                    attempts that actually reached out.
--   3. claim_order_for_pos_push() -- atomic single-flight claim on an order, so a
--                                    redelivered job cannot push the same order twice.
--   4. pos_outbound_dlq           -- terminal failures used to be pgmq.delete()d, which
--                                    destroyed the payload. They now land here, visible
--                                    to venue staff and requeueable.

-- =========================================================================
-- 1. Visibility-timeout control (backoff)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_job_vt(
  _queue text,
  _msg_id bigint,
  _vt_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  IF _queue NOT IN ('jobs_loyalty', 'jobs_reports', 'jobs_notifications', 'jobs_pos_outbound') THEN
    RAISE EXCEPTION 'Unknown queue: %', _queue;
  END IF;
  -- Clamp: a negative offset would make the job immediately visible in a hot
  -- loop, and anything beyond a day is indistinguishable from dropping it.
  PERFORM 1 FROM pgmq.set_vt(_queue, _msg_id, GREATEST(0, LEAST(_vt_seconds, 86400)));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_job_vt(text, bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_vt(text, bigint, integer) TO service_role;

-- =========================================================================
-- 2. Per-message attempt state
--
-- Keyed by (queue, msg_id), which is stable for a message's whole lifetime.
-- Service-role only: RLS on with no policies.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pos_outbound_job_state (
  queue         text NOT NULL,
  msg_id        bigint NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (queue, msg_id)
);
ALTER TABLE public.pos_outbound_job_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_pos_job_attempt(
  _queue text,
  _msg_id bigint,
  _error text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _attempts integer;
BEGIN
  INSERT INTO public.pos_outbound_job_state (queue, msg_id, attempts, last_error)
  VALUES (_queue, _msg_id, 1, _error)
  -- The conflicting row is referenced by the table's own (unqualified) name here;
  -- a schema-qualified reference is not a valid FROM-clause entry.
  ON CONFLICT (queue, msg_id) DO UPDATE
    SET attempts   = pos_outbound_job_state.attempts + 1,
        last_error = COALESCE(EXCLUDED.last_error, pos_outbound_job_state.last_error),
        updated_at = now()
  RETURNING attempts INTO _attempts;
  RETURN _attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_pos_job_attempt(text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_pos_job_attempt(text, bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_pos_job_state(_queue text, _msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pos_outbound_job_state WHERE queue = _queue AND msg_id = _msg_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_pos_job_state(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pos_job_state(text, bigint) TO service_role;

-- =========================================================================
-- 3. Single-flight claim on an order
--
-- Without this the worker re-read the order and pushed it unconditionally, so
-- any redelivery (lost response, function timeout, a second enqueue from the
-- manual push button) produced a second docket in Exceed.
-- =========================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pos_push_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pos_push_attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.claim_order_for_pos_push(
  _order_id uuid,
  _force boolean DEFAULT false,
  _claim_ttl_seconds integer DEFAULT 300
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.orders%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Already delivered. _force is only set by an operator who explicitly
  -- confirmed a re-push of a sent order.
  IF NOT _force AND (_row.pos_order_id IS NOT NULL OR _row.pos_push_status = 'sent') THEN
    RETURN 'already_sent';
  END IF;

  -- Another worker invocation is mid-push. FOR UPDATE serialises the check.
  IF _row.pos_push_status = 'sending'
     AND _row.pos_push_claimed_at IS NOT NULL
     AND _row.pos_push_claimed_at > now() - make_interval(secs => _claim_ttl_seconds) THEN
    RETURN 'in_progress';
  END IF;

  UPDATE public.orders
     SET pos_push_status     = 'sending',
         pos_push_claimed_at = now(),
         pos_push_attempts   = COALESCE(pos_push_attempts, 0) + 1
   WHERE id = _order_id;

  -- A stale 'sending' means the previous attempt died after we started talking
  -- to the POS and we never learned the outcome. Re-sending is the lesser evil
  -- (the alternative is silently losing a paid order) but it is the one path
  -- that can genuinely duplicate, so the caller logs it loudly.
  IF _row.pos_push_status = 'sending' THEN
    RETURN 'reclaimed_stale';
  END IF;

  RETURN 'claimed';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_order_for_pos_push(uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_for_pos_push(uuid, boolean, integer) TO service_role;

-- =========================================================================
-- 4. Dead-letter queue
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pos_outbound_dlq (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  queue           text NOT NULL DEFAULT 'jobs_pos_outbound',
  msg_id          bigint,
  kind            text NOT NULL,
  order_id        uuid,
  payload         jsonb NOT NULL,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  breaker_state   text,
  status          text NOT NULL DEFAULT 'open',   -- open | requeued | resolved
  resolution_note text,
  resolved_by     uuid,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_outbound_dlq_venue_status
  ON public.pos_outbound_dlq (venue_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_outbound_dlq_order
  ON public.pos_outbound_dlq (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.pos_outbound_dlq ENABLE ROW LEVEL SECURITY;

-- Read-only to staff. Every mutation goes through the SECURITY DEFINER RPCs
-- below so the audit fields (resolved_by / resolved_at) cannot be forged.
DROP POLICY IF EXISTS "pos_outbound_dlq_staff_select" ON public.pos_outbound_dlq;
CREATE POLICY "pos_outbound_dlq_staff_select"
  ON public.pos_outbound_dlq FOR SELECT TO authenticated
  USING (venue_id IS NOT NULL AND public.is_venue_staff((SELECT auth.uid()), venue_id));

CREATE OR REPLACE FUNCTION public.pos_dlq_requeue(_dlq_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  _row public.pos_outbound_dlq%ROWTYPE;
  _msg_id bigint;
BEGIN
  SELECT * INTO _row FROM public.pos_outbound_dlq WHERE id = _dlq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DLQ entry not found';
  END IF;
  IF NOT public.is_venue_manager((SELECT auth.uid()), _row.venue_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _row.status <> 'open' THEN
    RAISE EXCEPTION 'DLQ entry is already %', _row.status;
  END IF;

  SELECT pgmq.send(_row.queue, _row.payload) INTO _msg_id;

  UPDATE public.pos_outbound_dlq
     SET status      = 'requeued',
         resolved_by = (SELECT auth.uid()),
         resolved_at = now(),
         updated_at  = now()
   WHERE id = _dlq_id;

  -- Put the order back in a claimable state. pos_order_id is deliberately left
  -- alone: if it is set, claim_order_for_pos_push() will refuse and the retry
  -- becomes a no-op, which is the correct outcome for an order that did land.
  IF _row.order_id IS NOT NULL THEN
    UPDATE public.orders
       SET pos_push_status = 'queued', pos_push_error = NULL, pos_push_claimed_at = NULL
     WHERE id = _row.order_id;
  END IF;

  RETURN _msg_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_dlq_requeue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_dlq_requeue(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pos_dlq_resolve(_dlq_id uuid, _note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _venue uuid;
BEGIN
  SELECT venue_id INTO _venue FROM public.pos_outbound_dlq WHERE id = _dlq_id FOR UPDATE;
  IF _venue IS NULL THEN
    RAISE EXCEPTION 'DLQ entry not found';
  END IF;
  IF NOT public.is_venue_manager((SELECT auth.uid()), _venue) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.pos_outbound_dlq
     SET status          = 'resolved',
         resolution_note = COALESCE(_note, resolution_note),
         resolved_by     = (SELECT auth.uid()),
         resolved_at     = now(),
         updated_at      = now()
   WHERE id = _dlq_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_dlq_resolve(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_dlq_resolve(uuid, text) TO authenticated, service_role;

-- =========================================================================
-- 5. Housekeeping: job-state rows are deleted on every terminal outcome, but a
--    crash between ack and cleanup would orphan one. Sweep daily.
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule('pos-outbound-job-state-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pos-outbound-job-state-cleanup');

SELECT cron.schedule(
  'pos-outbound-job-state-cleanup',
  '17 4 * * *',
  $$DELETE FROM public.pos_outbound_job_state WHERE updated_at < now() - interval '7 days'$$
);
