---
name: QR codes are permanent
description: QR codes use stable table UUIDs, never expire, and are printed as physical stickers — never regenerate or change URLs
type: constraint
---
QR codes default to `https://shyndig.lovable.app/order/{venueId}/{tableId}` and are printed as physical stickers on stable table UUIDs.
**Never** regenerate, change, or invalidate existing QR code URLs.

White-label exception (added 2026-05-07): a venue can be pinned to a non-default brand via `venues.white_label_brand_id`. When pinned, **newly created** tables emit QR URLs on that brand's `consumer_host` instead. Existing rows with a stored `qr_code` value are returned verbatim by `getLiveUrl` so previously printed stickers keep working.

The default-brand consumer host must remain `shyndig.lovable.app` (previously `sippaai.lovable.app` — migrated 2026-04-16).
