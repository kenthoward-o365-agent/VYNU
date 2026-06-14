ALTER TABLE public.api_webhooks DROP COLUMN IF EXISTS secret;
REVOKE ALL ON public.api_webhooks FROM anon;