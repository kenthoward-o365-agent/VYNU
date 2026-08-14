# H&L OrderNOW

Agentic QR-code ordering, payments and diner CRM for Australian hospitality venues,
built for the H&L POS ecosystem. Originally generated in [Lovable](https://lovable.dev)
and still synced with it — every change pushed to `main` flows back into the Lovable
editor, and Lovable's agent commits directly to this repo.

Vite 5 + React 18 + TypeScript, Tailwind + shadcn/ui, React Router 6, TanStack Query.
Backend is Supabase (Lovable Cloud project `hjcikekaythqjhcuznjf`): Postgres with RLS,
plus 57 Deno edge functions under `supabase/functions/`.

## Commands

```bash
npm install
npm run dev    # Vite on :8080
npm run build
npm run lint
npm test       # vitest — 203 tests, all passing as of 2026-08-14
npx tsc -p tsconfig.app.json --noEmit
```

Playwright is configured (`playwright.config.ts`) but there is no `test:e2e` script;
run it via `npx playwright test`.

---

## Read this before touching the database

**`.env` points local dev at the live project.** `npm run dev` on a laptop reads
and writes **production data** — `hjcikekaythqjhcuznjf` is the only database there
is. No local stack, no staging. Be correspondingly careful with anything that
mutates orders, payments, or venues.

**`supabase/migrations/` is the schema's source of truth** — 223 files, ~16k lines,
2026-04-07 onward. Read it rather than inferring schema from
`src/integrations/supabase/types.ts`: the migrations carry the RLS policies,
`SECURITY DEFINER` settings, function bodies, triggers, indexes and partition
definitions that the generated types cannot express.

**Those 223 files were deleted once, and the deletion was invisible.** Commit
`e2c2660` ("Add integration configuration from remix", `gpt-engineer-app[bot]`,
2026-08-14) removed the entire directory as a remix-sync artefact while the Lovable
sandbox kept its copy — so the repo silently lost all schema history while Lovable
carried on working normally. Restored in `dcfabe3`. **If `supabase/migrations/` ever
looks empty again, check `git log --diff-filter=D -- supabase/migrations` before
concluding the migrations never existed.**

Every table in the live schema is created by these migrations, with one expected
exception: the monthly partitions of `api_request_log` and `pos_sync_log`
(`*_y2026m*`) are created at runtime by `ensure_monthly_partition` /
`ensure_log_partitions`, not by any migration.

Migrations are applied by Lovable, not from here — `supabase/config.toml` holds
only `project_id` and there is no local Supabase stack. Treat a new file in
`migrations/` as a record of something Lovable already applied to production, not
as pending work.

---

## Architecture

### Two routing shells

`src/App.tsx` splits the app at the top level:

- **`RootRoutes`** — public, no auth: the marketing site (`/`, `/features`,
  `/compare`), the diner ordering flow (`/order/:venueId/:tableId`),
  `/reset-password`, `/developers`, `/billing/setup/*`, and the MCP OAuth consent
  screen at `/.lovable/oauth/consent`.
- **`AppRoutes`** — everything else, wrapped in `AuthProvider` → `VenueProvider` →
  `AuditDateProvider` → `DashboardLayout`. This is the operator and platform-admin
  application.

The diner flow has its own nested `ErrorBoundary` with a distinct fallback, because
a diner needs to know *whether their order was placed* — a generic error screen is
not acceptable there.

### Auth and venue resolution

`VenueContext` (`src/contexts/VenueContext.tsx`) is the centre of gravity and the
easiest place to break things.

- Venue access is earned through `venue_staff` **only**. The platform
  `tabless_admin` role grants the Admin section and nothing else — an admin who is
  also staff at a venue operates there at their staff role like any other operator.
- Active-venue resolution order: saved `localStorage` selection → server-side
  `venue_staff.is_primary` → auto-pick only if the user has exactly one venue →
  otherwise `null` and force `VenueChooserModal`. Admins only ever get the saved
  selection; entering a venue must be deliberate.
- It queries through a **separate, session-scoped Supabase client**
  (`createSessionClient`), not the app singleton, and refetches only when
  `user.id` changes — not on token refresh, because refetching wipes in-flight
  form state on Settings pages. Preserve both behaviours.
- Sensitive `venues` columns (email, phone, `subscription_*`) are not selectable by
  the `authenticated` role; fetch them via the `get_venue_admin_detail` RPC. The
  explicit `VENUE_COLUMNS` list exists for that reason — don't replace it with `*`.
- A signed-in user with no venue and no admin role is signed straight back out
  (flagged via the `shyndig_not_provisioned` sessionStorage key).

### Four independent authorisation layers

Do not conflate these:

| Layer | Source | Enforced by | Controls |
|---|---|---|---|
| **Package tier** | `venue_feature_flags.tier` + `flags` | `RequireFeature`, `useFeatures` | What the venue *bought*. Fails closed to the base `bite` tier. |
| **Role nav** | `venue_role_permissions.nav_keys` | sidebar rendering only | Which nav items a role *sees*. |
| **Per-user order actions** | three booleans on `venue_staff` | `Orders.tsx` button groups | `can_update_order_status`, `can_reopen_closed_orders`, `can_process_refunds`. |
| **Platform admin** | `user_roles.role = 'tabless_admin'` | `RequireAdmin` | The `/admin/*` section. |

Two things follow. First, `nav_keys` is **presentation only** — routes such as
`/orders` and `/menu` carry no permission guard, so a user whose role omits that
nav key can still reach the page by URL. RLS is the actual boundary; treat the
sidebar as UX, not security. Second, the legacy `can_update_order_status` and
`can_reopen_and_refund_orders` columns still exist on `venue_role_permissions` but
are **no longer read** — the live values are the per-user ones on `venue_staff`.

Venue owners short-circuit to full access in `usePermissions()`.

### Edge functions

`supabase/functions/` — Deno, one directory per function, plus:

- **`_shared/`** — cross-cutting helpers: `api-auth.ts`, `rate-limit.ts`,
  `require-feature.ts` (server-side package gating), `pos-adapter.ts` /
  `pos-context.ts`, `loyalty-engine.ts`, `safe-error.ts`, `url-guard.ts` (SSRF),
  `secure-compare.ts`, `ai-usage.ts` (token/cost logging to `ai_usage_log`).
- **`adapters/`** — POS integrations: `hl_exceed` (the primary target), `doshii`,
  `lightspeed`, `square`, `mock`.

Rough grouping of the 57: POS sync (`pos-*`, ~14, with an outbound job queue and a
DLQ), accounts receivable and venue billing on Stripe (`ar-*`, ~11), the AI layer
(`diner-chat`, `copilot-chat`, `upsell-suggest`, `ai-insights`, `onboarding-chat`,
`generate-menu-image`, `import-menu`, `generate-modifiers`), payments
(`adyen-payment`), partner/public API (`partner-*`, `mcp`), and scheduled ticks
(`session-tick`, `throttle-tick`, `process-job-queue`, `ar-*` cron entrypoints).

**Trap: you cannot tell from this repo which functions are public.**
`supabase/config.toml` contains only `project_id` — no `[functions.*]` blocks — so
every `verify_jwt` setting lives in Lovable's platform config. Exactly one function
(`pos-hl-webhook`) documents `verify_jwt = false` in a comment. Others clearly must
also be public (POS webhooks, Stripe webhooks, `csp-report`, the diner-facing AI
endpoints) but nothing in the tree says so. Before assuming an endpoint is
authenticated, read the function: the public ones authenticate themselves via HMAC
signature, API key, or a token, not via JWT.

Functions are deployed by Lovable, not from here. There is no local Supabase stack.

---

## Product rules that are not negotiable

**Payments brand.** The user-visible payments product is **H&L Pay** (73
occurrences across `src/`). The underlying processor — Adyen, and the internal
Valpay platform — must **never** appear in any user-visible surface: no UI labels,
button text, error messages, toasts, or Knowledge Base articles. Internal
identifiers deliberately keep the old names: the `adyen-payment` edge function, the
`AdyenDropin.tsx` filename, `provider: "adyen"` rows, and the `ShyndigPayDropin`
component export (a leftover from an earlier brand — identifier only, never
rendered). Leave them.

**No raw card form, ever (PCI SAQ A).** Card entry is exclusively the hosted
Drop-in iframe or a wallet (Apple Pay / Google Pay). The browser only ever handles
the tokenised `paymentMethod` the Drop-in produces. `adyen-payment` rejects any
`create_payment` carrying a `card` field with `400 Raw card data is not accepted`.
When the Drop-in cannot load on a real venue, the UI blocks payment — it must never
degrade to collecting a PAN. Venue billing (AR) is a separate path on Stripe hosted
Checkout, also SAQ A. Supporting docs: [docs/pci/](docs/pci/).

**QR codes are permanent.** They encode stable table UUIDs and are printed as
physical stickers. Never regenerate, change, or invalidate an existing QR URL.
Rows with a stored `qr_code` are returned verbatim so previously printed stickers
keep working; only *newly created* tables pick up a white-label
`consumer_host` via `venues.white_label_brand_id`.

**Legacy identifiers stay.** `shyndig`, `sippa`, and `tabless` appear throughout the
code from earlier brand names — including the `tabless_admin` role, the
`tabless_active_venue` localStorage key, and `SippaAnalytics.tsx` (surfaced as
"Spark AI Analytics"). Renaming them is out of scope and risky. Only user-visible
strings carry the H&L OrderNOW name.

---

## Conventions

- Path alias `@/` → `src/`. Vite dedupes `react`, `react-dom`, and TanStack Query —
  don't add duplicate copies.
- Query defaults are set globally in `App.tsx`: 1 min `staleTime`, 5 min `gcTime`,
  no refetch on window focus, one retry.
- Tests are colocated (`*.test.ts[x]`) and run under jsdom. The heaviest coverage is
  `src/lib/validation.test.ts` (110 cases). Prefer extending pure helpers in
  `src/lib/` over testing through components.
- Edge-function errors reaching the UI go through `src/lib/function-errors.ts`,
  which surfaces 4xx bodies but never a 5xx body (they can leak raw exception text).
- `src/integrations/supabase/types.ts` and `client.ts` are **generated** — do not
  hand-edit. They track whatever Lovable last applied to the database; when they
  change, the corresponding migration should already be in `supabase/migrations/`.
  If it isn't, the schema changed without a recorded migration — worth chasing.

## Further context

- `.lovable/memory/` — Lovable's own project notes: brand palette, roles model,
  payments architecture, gratuities, display terminals. Mostly accurate, but the
  payments note still calls the product "ShyndigPay"; the current brand is H&L Pay.
- `.lovable/plan/` — dated plans from previous Lovable sessions, useful as a
  changelog of intent.
- `docs/pci/` — incident response, secret rotation, TPSP register.
- `docs/marketing/` — campaign copy bank and the marketing-site design brief.
