
ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS auto_push_orders boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pos_push_status text,
  ADD COLUMN IF NOT EXISTS pos_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pos_push_error text;

CREATE OR REPLACE FUNCTION public.enqueue_order_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  _integ public.venue_pos_integrations%ROWTYPE;
BEGIN
  SELECT * INTO _integ FROM public.venue_pos_integrations WHERE venue_id = NEW.venue_id;
  IF _integ.venue_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(_integ.auto_push_orders, false) THEN RETURN NEW; END IF;
  IF COALESCE(_integ.connection_status, 'disconnected') <> 'connected' THEN RETURN NEW; END IF;

  PERFORM pgmq.send('jobs_pos_outbound', jsonb_build_object(
    'kind', 'send_order',
    'venue_id', NEW.venue_id,
    'order_id', NEW.id
  ));

  UPDATE public.orders SET pos_push_status = 'queued' WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_pos_auto_push ON public.orders;
CREATE TRIGGER trg_orders_pos_auto_push
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_push_on_insert();
