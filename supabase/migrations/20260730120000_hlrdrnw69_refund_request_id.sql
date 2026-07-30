-- HLRDRNW-69 (PR review): stable per-refund idempotency id.
--
-- Each refund attempt now carries a client-generated `request_id` that is also
-- used as the Adyen Idempotency-Key/reference. The unique index guarantees a
-- retried refund cannot be logged twice, and (combined with the matching Adyen
-- idempotency key) cannot be charged twice — fixing the earlier scheme where the
-- key was derived from the mutable remaining balance and a retry after logging
-- could produce a new key and issue a second refund.

ALTER TABLE public.order_refunds
  ADD COLUMN IF NOT EXISTS request_id text;

-- Full unique index. NULLs are distinct in Postgres, so pre-existing rows that
-- have no request_id are unaffected and multiple NULLs remain allowed. A full
-- (non-partial) index is used so PostgREST's upsert ON CONFLICT can infer it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_refunds_request_id
  ON public.order_refunds (request_id);

COMMENT ON COLUMN public.order_refunds.request_id IS
  'Stable client-generated idempotency id for a refund attempt; also used as the Adyen Idempotency-Key/reference so a retried refund is neither logged nor charged twice.';
