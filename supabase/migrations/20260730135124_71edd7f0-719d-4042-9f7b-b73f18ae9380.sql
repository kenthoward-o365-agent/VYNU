ALTER TABLE public.pos_providers
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

INSERT INTO public.pos_providers (slug, name, auth_type, status, is_active, display_order, is_default, docs_url, capabilities, config_schema, webhook_url_template)
VALUES
('hl_exceed','H&L Exceed','oauth2','beta',true,0,true,'https://developer.hlpos.com/reference/addorder',
 '{"menu_pull":false,"menu_push":false,"orders_pull":true,"orders_push":true,"order_send":true,"snooze":false,"webhooks":true,"approval_queue":true,"payments":false}'::jsonb,
 '[{"key":"oauth_token_url","label":"OAuth token URL","type":"url","required":true,"default":"https://auth.hlcloud.com.au/oauth/token"},
   {"key":"oauth_audience","label":"OAuth audience","type":"text","required":true,"default":"handl-production-api","help":"Sandbox: handl-sandbox-api"},
   {"key":"web_orders_base_url","label":"Web Orders base URL","type":"url","required":true,"default":"https://weborders.hlcloud.com.au/api/order"},
   {"key":"integrator_id","label":"Integrator ID","type":"number","required":true,"help":"Assigned by H&L"},
   {"key":"recipient_id","label":"Recipient ID","type":"number","required":true,"help":"Assigned by H&L"},
   {"key":"station_no","label":"Station number","type":"number","required":true},
   {"key":"default_tender_code","label":"Default tender code","type":"number","required":false,"default":63,"help":"63 = card (fast tender)"},
   {"key":"serving_type","label":"Serving type","type":"number","required":false,"default":0},
   {"key":"interface_type","label":"Interface type","type":"number","required":false,"default":0},
   {"key":"test_mode","label":"Test mode","type":"boolean","required":false,"default":true},
   {"key":"client_id","label":"OAuth client ID","type":"secret","required":true},
   {"key":"client_secret","label":"OAuth client secret","type":"secret","required":true},
   {"key":"shared_secret","label":"Webhook shared secret","type":"secret","required":false}]'::jsonb,
 '{SUPABASE_URL}/functions/v1/pos-hl-webhook'),
('doshii','Doshii','jwt','ga',false,10,false,'https://docs.doshii.io',
 '{"menu_pull":true,"menu_push":true,"orders_pull":true,"orders_push":true,"snooze":true}'::jsonb,
 '[{"key":"location_id","label":"Doshii location ID","type":"text","required":true},
   {"key":"location_token","label":"Location token","type":"secret","required":true}]'::jsonb,
 NULL),
('square','Square','oauth2','alpha',true,20,false,'https://developer.squareup.com',
 '{"menu_pull":true,"orders_push":true,"payments":true}'::jsonb,
 '[{"key":"location_id","label":"Square location ID","type":"text","required":true},
   {"key":"access_token","label":"Square access token","type":"secret","required":true},
   {"key":"sandbox","label":"Use sandbox","type":"boolean","required":false,"default":true}]'::jsonb,
 '{SUPABASE_URL}/functions/v1/pos-order-webhook'),
('lightspeed','Lightspeed','oauth2','alpha',true,30,false,'https://developers.lightspeedhq.com',
 '{"menu_pull":true,"orders_push":true}'::jsonb,
 '[{"key":"account_id","label":"Account / outlet ID","type":"text","required":true},
   {"key":"register_id","label":"Register ID","type":"text","required":false}]'::jsonb,
 NULL),
('mock','Mock Provider (dev)','api_key','beta',true,40,false,NULL,
 '{"menu_pull":true,"menu_push":true,"orders_pull":true,"orders_push":true,"order_send":true,"snooze":true}'::jsonb,
 '[{"key":"label","label":"Label","type":"text","required":false}]'::jsonb,
 NULL)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  auth_type = EXCLUDED.auth_type,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  is_default = EXCLUDED.is_default,
  docs_url = EXCLUDED.docs_url,
  capabilities = EXCLUDED.capabilities,
  config_schema = EXCLUDED.config_schema,
  webhook_url_template = EXCLUDED.webhook_url_template;

CREATE UNIQUE INDEX IF NOT EXISTS pos_providers_single_default
  ON public.pos_providers (is_default) WHERE is_default;