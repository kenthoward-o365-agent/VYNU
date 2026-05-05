# Project Memory

## Core
Tab-Less: agentic dining platform. Australia-first. Replaces menus with AI intent.
Dark sidebar operator UI. Primary purple hsl(252, 85%, 60%). Mobile-first consumer (Phase 2).
Lovable Cloud backend. Pay-per-order model. Chat + TikTok feed for consumer AI.
QR codes are permanent, printed as stickers — never regenerate URLs.
Diner Resume Gate (after tab close) MUST require password re-entry, not tap-to-confirm.

## Memories
- [Product vision](mem://features/vision) — Full product vision and competitive positioning
- [Database schema](mem://features/schema) — All tables, enums, RLS policies
- [Phase plan](mem://features/phases) — Phase 1 operator dashboard, Phase 2 consumer mobile
- [QR codes permanent](mem://constraints/qr-codes-permanent) — QR codes use stable UUIDs, never expire, printed as stickers
- [Diner resume requires password](mem://constraints/diner-resume-requires-password) — Resume Gate after tab close must re-prompt for password before treating diner as signed in
