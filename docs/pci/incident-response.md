# Incident Response Plan — Payments / CDE

PCI DSS v4.0.1 Req 12.10 — Test annually.

## Roles

- **Incident Commander** — Head of Platform
- **Payments Lead** — manages Adyen + H&L Pay communications
- **Comms Lead** — venues + diners + regulators
- **Forensics** — engages QSA / forensic investigator (PFI) if required

## Severity

| Sev | Criteria | Target response |
|-----|----------|-----------------|
| 1   | Suspected CHD exposure, unauthorised access to payments config, or active fraud | < 15 min |
| 2   | Failed integrity check, unexpected CSP report from payment page, unusual refund pattern | < 1 hour |
| 3   | Internal control gap (no diner impact) | < 1 business day |

## First 60 minutes — Sev 1

1. Page the on-call (Incident Commander).
2. Set `venue_payment_config.is_active = false` for affected venues via Admin → Payments.
3. Rotate `adyen-payment` and `hmac_key` secrets (see `secret-rotation.md`).
4. Revoke compromised operator sessions in Supabase Auth.
5. Begin evidence preservation: snapshot `payment_config_audit`, `pci_script_baseline`,
   `api_request_log` for the last 7 days.
6. Notify Adyen (compromise notification email) — required under merchant agreement.

## Investigation

- Pull `payment_config_audit` for the last 90 days, filtered by `venue_id`.
- Pull `pci_script_baseline` rows with `is_authorised = false`.
- Pull Supabase edge function logs for `adyen-payment` and `csp-report`.
- Pull Adyen transaction logs for the affected window.

## Notification (Req 12.10.x + state law)

- **Adyen** — within 24 hours, per merchant agreement.
- **Card brands** — Adyen handles upstream; we provide details.
- **Affected diners** — if CHD exposure confirmed, within statutory window
  (Australia: OAIC Notifiable Data Breach within 30 days).
- **Acquirer** — Adyen serves as acquirer; same contact path.
- **Venues** — within 4 hours of confirmed Sev 1.

## Post-incident (within 14 days)

1. Root-cause analysis written up.
2. PCI controls re-attested.
3. SAQ A re-evaluated — does the incident push us to SAQ A-EP?
4. Update this runbook with lessons learned.
5. Tabletop exercise within 90 days.
