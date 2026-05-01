-- Phase 4: async job queue infrastructure.
-- Uses pgmq for durable, retry-safe job processing inside Lovable Cloud.

CREATE EXTENSION IF NOT EXISTS pgmq;

-- =========================================================================
-- Queues
-- =========================================================================
SELECT pgmq.create('jobs_loyalty');     -- loyalty awards (was sync, now async)
SELECT pgmq.create('jobs_reports');     -- venue/group report generation
SELECT pgmq.create('jobs_notifications'); -- diner-facing notifications fan-out

-- =========================================================================
-- SECURITY DEFINER wrapper so edge functions / authenticated callers can
-- enqueue without granting raw pgmq privileges to anon / service-role logic.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.enqueue_job(
  _queue text,
  _payload jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  _msg_id bigint;
BEGIN
  IF _queue NOT IN ('jobs_loyalty', 'jobs_reports', 'jobs_notifications') THEN
    RAISE EXCEPTION 'Unknown queue: %', _queue;
  END IF;
  SELECT pgmq.send(_queue, _payload) INTO _msg_id;
  RETURN _msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_job(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.enqueue_job(text, jsonb) TO service_role;

-- Read + delete wrappers used by the worker edge function.
CREATE OR REPLACE FUNCTION public.dequeue_jobs(
  _queue text,
  _vt_seconds integer DEFAULT 60,
  _qty integer DEFAULT 10
) RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  IF _queue NOT IN ('jobs_loyalty', 'jobs_reports', 'jobs_notifications') THEN
    RAISE EXCEPTION 'Unknown queue: %', _queue;
  END IF;
  RETURN QUERY
  SELECT q.msg_id, q.read_ct, q.enqueued_at, q.message
  FROM pgmq.read(_queue, _vt_seconds, _qty) q;
END;
$$;
REVOKE ALL ON FUNCTION public.dequeue_jobs(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.dequeue_jobs(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.ack_job(_queue text, _msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  IF _queue NOT IN ('jobs_loyalty', 'jobs_reports', 'jobs_notifications') THEN
    RAISE EXCEPTION 'Unknown queue: %', _queue;
  END IF;
  RETURN pgmq.delete(_queue, _msg_id);
END;
$$;
REVOKE ALL ON FUNCTION public.ack_job(text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.ack_job(text, bigint) TO service_role;

-- =========================================================================
-- Notifications table — surfaced to the frontend via realtime so users see
-- background-job results without polling. Used for "your report is ready",
-- "loyalty bonus awarded", etc.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                 -- operator (auth.users.id) when applicable
  diner_id uuid,                -- diner_profiles.id when applicable
  venue_id uuid,
  kind text NOT NULL,           -- 'loyalty_awarded', 'report_ready', etc.
  title text NOT NULL,
  body text,
  payload jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_diner_unread
  ON public.notifications (diner_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_user_select"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR diner_id = public.get_user_diner_profile_id()
    OR (venue_id IS NOT NULL AND public.is_venue_staff((SELECT auth.uid()), venue_id))
  );

CREATE POLICY "notifications_user_update_read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR diner_id = public.get_user_diner_profile_id()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR diner_id = public.get_user_diner_profile_id()
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =========================================================================
-- Job-run audit log — visibility into what the worker did, retry counts,
-- failures. Append-only.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.job_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  msg_id bigint,
  status text NOT NULL,         -- 'success' | 'retry' | 'dlq' | 'error'
  attempt integer DEFAULT 1,
  duration_ms integer,
  error text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_run_log_queue_created
  ON public.job_run_log (queue, created_at DESC);

ALTER TABLE public.job_run_log ENABLE ROW LEVEL SECURITY;
-- Only admins can inspect (RLS deny-by-default for everyone else).
CREATE POLICY "job_run_log_admin_select"
  ON public.job_run_log FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'tabless_admin'));