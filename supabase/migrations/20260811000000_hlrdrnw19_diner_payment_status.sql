-- HLRDRNW-19 — the diner's post-payment confirmation needs to know the order was
-- PAID, which is a different question from how far the kitchen has got with it.
--
-- Until now the browser answered it by writing orders.status = 'paid' itself.
-- That write is denied by RLS (the only UPDATE policy on public.orders is
-- "Staff can update orders", gated on is_venue_staff) and the client discarded
-- the error, so every paid order stayed at status = 'received' and the receipt
-- screen — which keyed off status = 'paid' — never rendered. Verified on
-- staging: 14 of 18 orders sit at payment_status='paid' AND status='received'.
--
-- status stays what it has always meant: fulfilment progress, owned by venue
-- staff (received → preparing → ready → served, then 'paid' on close-out by
-- settle_tab). payment_status answers "has the money moved", and is now stamped
-- by adyen-payment under the service role once Adyen authorises. This function
-- returns it so the diner surface can gate the receipt on it.

DROP FUNCTION IF EXISTS public.get_diner_order_status(uuid);

CREATE OR REPLACE FUNCTION public.get_diner_order_status(_order_id uuid)
 RETURNS TABLE(
   id uuid,
   status text,
   payment_status text,
   total numeric,
   created_at timestamp with time zone,
   extra_wait_minutes integer,
   throttled_until timestamp with time zone,
   service_mode text,
   pickup_location text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.status::text, o.payment_status, o.total, o.created_at,
         o.extra_wait_minutes, o.throttled_until,
         CASE
           WHEN z.service_mode IS NULL OR z.service_mode = 'inherit'
             THEN COALESCE(v.default_service_mode, 'table_delivery')
           ELSE z.service_mode
         END AS service_mode,
         COALESCE(NULLIF(z.pickup_location_label, ''), NULLIF(v.default_pickup_location, '')) AS pickup_location
  FROM public.orders o
  JOIN public.venues v ON v.id = o.venue_id
  LEFT JOIN public.tables t ON t.id = o.table_id
  LEFT JOIN public.venue_zones z ON z.id = t.zone_id
  WHERE o.id = _order_id;
$function$;

COMMENT ON FUNCTION public.get_diner_order_status(uuid) IS
  'Diner-facing order status for the confirmation/tracking screen. SECURITY DEFINER because guests can read neither public.orders nor public.venues; returns one order''s presentation fields only, keyed on an unguessable order id. payment_status is server-stamped by adyen-payment and is what the receipt gates on (HLRDRNW-19).';

GRANT EXECUTE ON FUNCTION public.get_diner_order_status(uuid) TO anon, authenticated, service_role;
