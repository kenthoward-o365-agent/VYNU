-- HLRDRNW-66 (API/Edge/Abuse) — shared abuse-prevention primitives.
--
-- Provides two building blocks used by Edge Functions:
--   1. check_rate_limit()   — atomic, cross-instance fixed-window rate limiter
--                             (AEA-02). Serverless functions have no shared
--                             memory, so an in-process counter is useless; this
--                             keeps the counter in Postgres where every function
--                             instance sees the same value.
--   2. claim_webhook_event() — one-shot idempotency claim for webhook replay
--                             protection (AEA-08). Returns true only the first
--                             time a given (source, event_key) is seen.
--
-- Both are SECURITY DEFINER and callable only by service_role — Edge Functions
-- invoke them with the service-role client. anon/authenticated get no access.

-- ── Rate limiter ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No policies → deny-by-default for anon/authenticated. service_role bypasses RLS
-- and the SECURITY DEFINER function below runs as owner regardless.
REVOKE ALL ON public.rate_limit_counters FROM anon, authenticated;

-- Atomic fixed-window increment. Returns true when the request is WITHIN the
-- limit (i.e. allowed), false when it should be throttled. Old windows are inert
-- rows; a periodic cleanup job may prune window_start < now() - interval '1 day'.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket         text,
  _limit          integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws  timestamptz;
  _cnt integer;
BEGIN
  IF _bucket IS NULL OR _limit IS NULL OR _window_seconds IS NULL OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'check_rate_limit: invalid arguments';
  END IF;

  -- Truncate now() down to the current fixed window.
  _ws := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limit_counters (bucket, window_start, count)
  VALUES (_bucket, _ws, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = public.rate_limit_counters.count + 1
  RETURNING count INTO _cnt;

  RETURN _cnt <= _limit;
END;
$$;

REVOKE ALL   ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- ── Webhook idempotency / replay claim ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  source       text        NOT NULL,
  event_key    text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, event_key)
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.processed_webhook_events FROM anon, authenticated;

-- Returns true if this (source, event_key) was NOT seen before (caller should
-- process it); false if it is a replay/duplicate (caller should skip). The
-- INSERT … ON CONFLICT DO NOTHING makes the claim atomic under concurrency.
CREATE OR REPLACE FUNCTION public.claim_webhook_event(
  _source    text,
  _event_key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted integer;
BEGIN
  IF _source IS NULL OR _event_key IS NULL THEN
    RAISE EXCEPTION 'claim_webhook_event: invalid arguments';
  END IF;

  INSERT INTO public.processed_webhook_events (source, event_key)
  VALUES (_source, _event_key)
  ON CONFLICT (source, event_key) DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted = 1;
END;
$$;

REVOKE ALL   ON FUNCTION public.claim_webhook_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_webhook_event(text, text) TO service_role;

-- Release a previously-claimed event. Used when the work that follows a claim
-- fails (e.g. a transient DB error), so a legitimate retry is not permanently
-- deduped away. SECURITY DEFINER because service_role has no direct DML on the
-- table — all access goes through these definer functions.
CREATE OR REPLACE FUNCTION public.release_webhook_event(
  _source    text,
  _event_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.processed_webhook_events
  WHERE source = _source AND event_key = _event_key;
END;
$$;

REVOKE ALL   ON FUNCTION public.release_webhook_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.release_webhook_event(text, text) TO service_role;
