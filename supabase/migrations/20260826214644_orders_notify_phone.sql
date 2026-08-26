-- Pickup-zone SMS: the diner-provided mobile for "order ready" texts.
-- Stamped at checkout when the table's zone resolves to counter_pickup with
-- notify_sms_on_ready. notify-order-ready prefers this over the diner_profiles
-- lookup, which also makes SMS possible for anonymous orders (customer_id null).
alter table public.orders add column if not exists notify_phone text;

comment on column public.orders.notify_phone is
  'E.164 mobile provided at checkout for pickup-ready SMS (counter_pickup zones). Preferred over diner_profiles by notify-order-ready.';
