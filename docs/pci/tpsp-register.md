# Third-Party Service Provider (TPSP) Register

PCI DSS v4.0.1 Req 12.8 — Maintain a list of TPSPs that handle, store, process,
or transmit cardholder data on behalf of H&L OrderNow, or that could otherwise
affect the security of the cardholder data environment (CDE).

Review and re-attest **at least annually** and whenever a TPSP changes.

| # | TPSP | Service to H&L OrderNow | Touches CDE? | PCI status (req 12.8.4) | AoC / evidence | Owner | Last reviewed |
|---|------|-------------------------|--------------|-------------------------|----------------|-------|---------------|
| 1 | **Adyen N.V.** (acquiring + PSP that powers H&L Pay) | Hosted card field (iframe), Apple Pay & Google Pay tokenisation, 3DS2, refunds, webhooks | Yes — full PAN never leaves Adyen | PCI DSS Level 1 Service Provider | `docs/pci/aoc/adyen-aoc-YYYY.pdf` | Payments lead | _pending_ |
| 2 | **Supabase (Lovable Cloud)** | Database, Auth, Edge Functions, Storage | No CHD stored — token references + PSP IDs only | PCI DSS Level 1 Service Provider (via parent infra) | `docs/pci/aoc/supabase-aoc-YYYY.pdf` | Platform lead | _pending_ |
| 3 | **Lovable** | Application hosting, build pipeline, custom domain | No CHD — serves static SPA + edge code | SOC 2 Type II (no PCI scope) | `docs/pci/aoc/lovable-soc2-YYYY.pdf` | Platform lead | _pending_ |
| 4 | **Apple Inc. — Apple Pay** | Wallet tokenisation on iOS/macOS | No — DPAN only, never PAN | PCI Council recognised wallet | Public attestation | Payments lead | _pending_ |
| 5 | **Google LLC — Google Pay** | Wallet tokenisation on Android/Chrome | No — DPAN only | PCI Council recognised wallet | Public attestation | Payments lead | _pending_ |
| 6 | **H&L Australia (Exceed POS)** | POS order push, menu sync via on-prem portal | No — orders only, no CHD | Out of CDE | Vendor SOC report | Integrations lead | _pending_ |

## Responsibility matrix (Req 12.8.5)

For each requirement of PCI DSS, document which party (Us / TPSP / Shared) is
accountable. Source the matrix from each provider's published "shared
responsibility" document and store under `docs/pci/responsibility/`.

| Requirement family | H&L OrderNow | Adyen | Supabase / Lovable |
|--------------------|--------------|-------|--------------------|
| 1 Network security | Shared | Yes | Yes |
| 2 Secure configurations | Shared | Yes | Yes |
| 3 Protect stored CHD | Yes (verify no CHD stored) | Yes | N/A |
| 4 Encrypted transmission | Shared | Yes | Yes |
| 5 Malware | N/A (no servers we patch) | Yes | Yes |
| 6 Secure software (incl. 6.4.3 payment-page scripts) | **Yes** | Drop-in code | Yes (platform) |
| 7 Restrict access | Yes (RBAC) | Yes | Yes |
| 8 Auth & MFA | Yes (HIBP + MFA) | Yes | Yes |
| 9 Physical | N/A | Yes | Yes |
| 10 Logging | Yes (payment_config_audit) | Yes | Yes |
| 11.6 Page change detection | **Yes** (pci-page-integrity-check) | N/A | N/A |
| 12 Policy | Yes | Yes | Yes |

## Onboarding a new TPSP (Req 12.8.3 / 12.9)

Before adding a new vendor that could touch the CDE:

1. Obtain a current **Attestation of Compliance** (AoC) and store in `docs/pci/aoc/`.
2. Sign a written agreement that includes the TPSP's PCI DSS obligations.
3. Update this register + responsibility matrix.
4. Re-scope our SAQ if necessary.
