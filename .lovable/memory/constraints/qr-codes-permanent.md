---
name: QR codes are permanent
description: QR codes use stable table UUIDs, never expire, and are printed as physical stickers — never regenerate or change URLs
type: constraint
---
QR codes point to `https://ordrup.lovable.app/order/{venueId}/{tableId}`.
They use stable table UUIDs and are printed as physical stickers.
**Never** regenerate, change, or invalidate QR code URLs.
The `PUBLISHED_BASE_URL` constant in `src/pages/Tables.tsx` must match the published domain.
Previously used `sippaai.lovable.app` — migrated to `ordrup.lovable.app` on 2026-04-16.
