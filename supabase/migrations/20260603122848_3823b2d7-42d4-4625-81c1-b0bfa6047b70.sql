UPDATE public.pos_providers
SET config_schema = '[
  {"key":"oauth_token_url","type":"url","label":"OAuth Token URL","required":true,"placeholder":"https://auth.hlcloud.com.au/oauth/token","default":"https://auth.hlcloud.com.au/oauth/token"},
  {"key":"oauth_audience","type":"text","label":"OAuth Audience","required":true,"default":"handl-production-api","help":"Use handl-sandbox-api for sandbox"},
  {"key":"web_orders_base_url","type":"url","label":"Web Orders Base URL","required":true,"default":"https://weborders.hlcloud.com.au/api/order"},
  {"key":"integrator_id","type":"number","label":"Integrator ID","required":true,"help":"Assigned by H&L per venue"},
  {"key":"recipient_id","type":"number","label":"Recipient ID","required":true,"help":"Assigned by H&L per venue"},
  {"key":"station_no","type":"number","label":"Station No","required":true,"help":"H&L station/terminal number"},
  {"key":"default_tender_code","type":"number","label":"Default Tender Code","required":false,"default":63,"help":"63 = card (default). Used for fast-tender orders."},
  {"key":"serving_type","type":"number","label":"Serving Type","required":false,"default":0},
  {"key":"interface_type","type":"number","label":"Interface Type","required":false,"default":0},
  {"key":"test_mode","type":"boolean","label":"Test Mode","required":false,"default":true,"help":"Sends test:true flag on every order. Keep ON until live creds are wired."},
  {"key":"client_id","type":"secret","label":"OAuth Client ID","required":true},
  {"key":"client_secret","type":"secret","label":"OAuth Client Secret","required":true},
  {"key":"shared_secret","type":"secret","label":"Webhook Shared Secret","required":false,"help":"For HMAC-SHA256 verification of inbound H&L webhooks"}
]'::jsonb,
    docs_url = 'https://developer.hlpos.com/reference/addorder',
    updated_at = now()
WHERE slug = 'hl_exceed';