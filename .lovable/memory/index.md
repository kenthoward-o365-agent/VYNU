# Memory: index.md
Updated: today

# Project Memory

## Core
Tab-Less: agentic dining platform. Australia-first. Replaces menus with AI intent.
Dark sidebar operator UI. Primary purple hsl(252, 85%, 60%). Mobile-first consumer (Phase 2).
Lovable Cloud backend. Pay-per-order model. Chat + TikTok feed for consumer AI.
QR codes are permanent, printed as stickers — never regenerate URLs.
Consumer checkout uses a Drop-in payment widget — Apple Pay + Google Pay + hosted card. Never re-add raw card fields as the primary flow.
Payments product is **OrdrPay** (in-house white-labelled PayFac — application, underwriting, funding, statements, chargebacks). Never name the underlying processor (Adyen, Valpay, etc.) in any user-visible surface: UI, Knowledge Base, error messages, or plans.

## Memories
- [Product vision](mem://features/vision) — Full product vision and competitive positioning
- [Database schema](mem://features/schema) — All tables, enums, RLS policies
- [Phase plan](mem://features/phases) — Phase 1 operator dashboard, Phase 2 consumer mobile
- [QR codes permanent](mem://constraints/qr-codes-permanent) — QR codes use stable UUIDs, never expire, printed as stickers
- [Payments architecture](mem://features/payments) — OrdrPay PayFac, Apple/Google Pay, mock mode, per-venue capture mode + statement descriptor
