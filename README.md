# VYNU

Agentic QR-code ordering, payments and diner CRM for hospitality venues, built
for the H&L POS ecosystem. Australia first.

The product goal is to remove the menu rather than digitise it: a diner scans a
code and talks — *"I'm in a hurry, what's fast?"*, *"I'm coeliac, what can I
have?"*, *"another round please"* — while operators get agentic menu building,
dynamic pricing, live metrics and predictive stock control.

> **Renaming in progress.** The product is being renamed from **H&L OrderNOW** to
> **VYNU**. Most code and UI strings still say H&L OrderNOW; treat that as
> pending work. Identifiers containing `shyndig`, `sippa` and `tabless` are
> earlier brand names and are deliberately left alone — see `CLAUDE.md`.

## Stack

Vite 5 · React 18 · TypeScript · Tailwind + shadcn/ui · React Router 6 ·
TanStack Query. Backend is Supabase: Postgres with RLS, plus ~56 Deno edge
functions under `supabase/functions/`.

## Getting started

```sh
npm install
npm run dev          # http://localhost:8080
```

```sh
npm test             # vitest
npm run lint
npm run build
npx tsc -p tsconfig.app.json --noEmit
```

Edge functions are Deno, not covered by vitest. Typecheck them with
`deno check supabase/functions/<name>/index.ts`.

## Read before changing anything

- **`CLAUDE.md`** — architecture, the four independent authorisation layers, and
  the product rules that are not negotiable (payments branding, PCI SAQ A, QR
  permanence).
- **`supabase/migrations/`** — the schema's source of truth, 223 files. Read it
  rather than inferring schema from `src/integrations/supabase/types.ts`; only
  the migrations carry RLS policies, function bodies, triggers and partitions.
- **`docs/migration/lovable-cutover.md`** — the plan for moving off the
  remaining Lovable infrastructure.
- **`docs/pci/`** — incident response, secret rotation, TPSP register.

⚠️ **`.env` points local dev at the live Supabase project.** `npm run dev` reads
and writes production data. There is no local or staging database.

## Deployment

Vercel, deployed from the CLI (no Git integration):

```sh
npx vercel --scope kent6119-1287s-projects          # preview
npx vercel --prod --scope kent6119-1287s-projects   # production
```

`vercel.json` carries the SPA rewrite. Without it, a QR scan cold-loading
`/order/:venueId/:tableId` would 404.

## Project history

Originally generated in [Lovable](https://lovable.dev) and synced to a Lovable
repo. That sync is being removed — see the cutover doc above for what remains
coupled (the Postgres project, the AI gateway used by 9 edge functions, and the
connector gateway behind Firecrawl and Lightspeed).

The original product-vision prompt this was built from is preserved in git
history at commit `4793888`.
