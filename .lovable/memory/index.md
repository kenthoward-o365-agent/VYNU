# Project Memory

## Core
Shyndig: AI-powered QR ordering + revenue platform for restaurants, pubs, bars, cafés. Australia-first.
Tagline: "We earn when you earn." Zero subscription, share of upsell + commission.
Brand palette: Midnight #111827, Gold #DBBE4F, Coral #E8845A, Slate #1E293B, Cream #FAF7F2.
Operator UI = Midnight sidebar (even in light mode), Gold accents, Coral support.
Lovable Cloud backend. POS-agnostic, browser-based, no app for guests.
QR codes are permanent, printed as stickers — never regenerate URLs.
DB column `is_ordrup_builtin` is legacy naming — keep as-is, don't rename.

## Memories
- [Shyndig brand colors](mem://design/brand-colors) — Full palette HSL + usage ratios from Brand Book v1.0
- [Product vision](mem://features/vision) — Full product vision and competitive positioning
- [Database schema](mem://features/schema) — All tables, enums, RLS policies
- [Phase plan](mem://features/phases) — Phase 1 operator dashboard, Phase 2 consumer mobile
- [QR codes permanent](mem://constraints/qr-codes-permanent) — QR codes use stable UUIDs, never expire, printed as stickers
