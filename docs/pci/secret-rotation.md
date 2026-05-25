# Secret rotation runbook (PCI DSS Req 8.6 / 3.7)

Rotate every secret at least once per 12 months, and immediately on suspected
compromise or operator departure.

| Secret | Where stored | Used by | Rotation cadence | Procedure |
|--------|--------------|---------|------------------|-----------|
| Adyen `api_key_live` | Lovable Cloud secrets | `adyen-payment` edge function | 6 months | Generate new API credential in Adyen CA → update secret via add_secret → confirm `/payments` succeeds → revoke old. |
| Adyen `hmac_key` | Lovable Cloud secrets | Webhook handler | 6 months | Generate new HMAC in Adyen CA → add secret → enable in CA → remove old after verification. |
| H&L Exceed `service_account_token` | `pos_providers.hl_exceed.service_account_token` | `pos-outbound-worker`, `pos-menu-pull` | 12 months | Rotate in H&L portal → update via Admin Integrations → confirm test connection. |
| H&L Exceed `shared_secret` | `pos_providers.hl_exceed.shared_secret` | `pos-hl-webhook` HMAC verify | 12 months | Rotate in H&L portal → update via Admin → next inbound webhook signed with new secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud secrets | Server-side edge fns | 12 months (or on compromise) | Use `supabase--rotate_api_keys` tool. |
| `LOVABLE_API_KEY` | Lovable Cloud secrets | AI gateway calls | 12 months | Use `ai_gateway--rotate_lovable_api_key` tool. |
| Operator admin passwords | Supabase Auth | Operator dashboard | On compromise + every 12 months | Force password reset; HIBP check enforced. |

## On compromise — within 24 hours

1. Disable `is_active` on the affected `venue_payment_config` row.
2. Rotate the implicated secret(s) using the procedure above.
3. Revoke any active operator sessions (Supabase Auth → Users).
4. Search `payment_config_audit` for changes by the compromised actor.
5. Trigger incident response (see `docs/pci/incident-response.md`).
