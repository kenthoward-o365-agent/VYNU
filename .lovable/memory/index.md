# Project Memory

## Core
Always white-label payments as **OrdrPay** (PayFac model). Never expose "Adyen" in UI, KB, settings, or memory — only in code symbols (e.g. `adyen-payment` function). Reason: OrdrUp acts as the merchant of record.
QR codes are permanent physical stickers tied to stable table UUIDs — never regenerate or change URLs.
Roles: each venue has custom `venue_roles` + `venue_role_permissions`. Use `usePermissions()` to gate nav and actions. Owner & tabless_admin always pass.

## Memories
- [QR codes permanent](mem://constraints/qr-codes-permanent) — Stable table UUIDs, no expiry
- [Brand colors](mem://design/brand-colors) — Primary palette and tokens
- [Gratuities](mem://features/gratuities) — Configurable tip prompt at checkout
- [Payments](mem://features/payments) — OrdrPay (white-labelled), refund flow, capture modes
- [Roles & permissions](mem://features/roles) — Custom per-venue roles, nav gating, refund permission
- [Schema](mem://features/schema) — Database tables overview
- [Vision](mem://features/vision) — Product vision and positioning
