# VYNU

Agentic QR-code ordering, payments and diner CRM for hospitality venues. This
repo is the **VYNU** product — sold outside H&L, partnering with multiple POS
vendors. Its sibling brand **H&L OrderNOW** (same origin codebase) lives on in
Lovable for H&L to sell to their own customers; the two are **separate
deployments and separate databases**, and this repo owes Lovable nothing.

Naming: product **VYNU** · payments **VYNU Pay** · diner AI agent **Vee**
(venues can rename it and upload their own icon in Settings). "H&L Exceed" is
the partner *POS integration* and correctly keeps its name.

Vite 5 + React 18 + TypeScript, Tailwind + shadcn/ui, React Router 6, TanStack
Query. Backend is Supabase: Postgres with RLS plus 56 Deno edge functions under
`supabase/functions/`.

## Repo, hosting, deploys

- **Repo:** `github.com/kenthoward-o365-agent/VYNU`. The old Lovable-synced repo
  (`remix-of-h-lordernow-vynu` on GitHub) is abandoned — **never push there**;
  Lovable's bot writes to it and once deleted all 223 migrations from it.
- **Hosting:** Vercel project `vynu` (scope `kent6119-1287s-projects`),
  Git-connected — **pushing `main` deploys to production** at
  https://vynu-chi.vercel.app. `vercel.json` carries the SPA rewrite; without it
  a QR scan cold-loading `/order/:venueId/:tableId` 404s.
- The production alias is **public and indexable**; deployment-specific URLs are
  SSO-protected. Env vars live in the Vercel project (build-time — changing one
  requires a redeploy).

## Commands

```bash
npm install
npm run dev    # Vite on :8080
npm run build
npm run lint   # ~900 pre-existing errors from the Lovable era — not a usable gate
npm test       # vitest — 203 tests, all passing as of 2026-08-16
npx tsc -p tsconfig.app.json --noEmit
```

Edge functions are Deno, not covered by vitest. Typecheck with
`DENO_NO_PACKAGE_JSON=1 deno check supabase/functions/<name>/index.ts` — the
env var stops Deno resolving the `npm:` imports in `_shared/ai.ts` against the
frontend's `package.json`. `copilot-chat` and `onboarding-chat` show a few
pre-existing errors in that mode; anything beyond those is yours.

---

## Databases — read before touching anything

**Two databases exist. This app uses the VYNU one.**

| Project | Role |
|---|---|
| `ewdjxdfgvpdcctqikdcy` | **VYNU's database** (org VYNU, `ap-southeast-2`). `.env`, the Vercel env vars, and `supabase/config.toml` all point here. Full schema (replayed 2026-08-14), **little to no data** — VYNU deliberately starts clean; the old data migration was dropped. |
| `hjcikekaythqjhcuznjf` | Lovable Cloud — the H&L OrderNOW instance. Holds that brand's data and users. Not reachable from our tooling; not this repo's concern anymore. |

Credentials never work across the two — each has its own `auth.users`.

**`npm run dev` writes to the VYNU database directly.** There is no local stack
or staging. The data is sparse today, but treat it as production.

**Edge functions ARE deployed to the VYNU project (2026-08-16).** All 56
deployed via `npx supabase functions deploy`; the 21 public-by-design ones
carry `verify_jwt = false` blocks in `supabase/config.toml` (each verified to
have in-body auth first). `CRON_SECRET` + `APP_URL` are set as function
secrets, and Vault holds matching `cron_secret` + `project_url`, so the cron
jobs fire (verified in `cron.job_run_details`). **Vendor secrets are still
unset** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_*`, `DOSHII_*`,
`LIGHTSPEED_API_KEY`, `PUBPLUS_EE_CLIENT_SECRET`, and the AI provider vars
(`AI_PROVIDER`/`ANTHROPIC_API_KEY` or `AI_GATEWAY_URL`/`AI_API_KEY`) — so
Stripe AR, SMS, those POS connectors and all AI calls fail at runtime until
VYNU-own accounts are provisioned. Deliberate: VYNU must not reuse the H&L
instance's vendor credentials.

### Migrations

`supabase/migrations/` (230 files) is the schema's source of truth — it carries
the RLS policies, function bodies, triggers, indexes and partitions that the
generated `types.ts` cannot express. Apply with:

```sh
npx supabase db push   # linked to ewdjxdfgvpdcctqikdcy; prompts for DB password
```

Things already learned the hard way:

- **Filename order is not application order.** Hand-authored migrations
  (descriptive names, vs Lovable's UUID names) carry back-dated timestamps; two
  pairs conflicted when first replayed in filename order. Both fixed
  (`*_replay_*.sql` supply missing preconditions), but assume more may lurk.
- Monthly partitions of `api_request_log` / `pos_sync_log` (`*_y2026m*`) are
  created at **runtime** by `ensure_monthly_partition`, not by migrations.
- If `supabase/migrations/` ever looks empty, run
  `git log --diff-filter=D -- supabase/migrations` before concluding anything.
- Pending as of 2026-08-16: `20260816230000_claude_model_prices.sql` is
  committed but may not be applied (Supabase API was 503ing) — `db push` fixes.

### Admin bootstrap

There is no self-signup for operators. First admin: create the user in the
Supabase dashboard (Add user → Create new user, **Auto Confirm on** — the
built-in email sender is rate-limited to ~2/hr and no custom SMTP is
configured), then:

```sql
insert into public.user_roles (user_id, role)
select id, 'tabless_admin' from auth.users where email = '...'
on conflict do nothing;
```

`tabless_admin` grants `/admin/*` only. Venue screens need a `venue_staff` row.
Sign in with the **Site ID field empty** to land on the admin section.

---

## Architecture

### Routing

`src/App.tsx`, two shells:

- **`RootRoutes`** — public: the diner flow (`/order/:venueId/:tableId`, with
  its own `ErrorBoundary` because a diner must know whether their order was
  placed), `/reset-password`, `/developers`, `/billing/setup/*`, and
  `/oauth/consent`. **There are no marketing pages** — `/` falls through to the
  auth shell (sign-in when logged out, role-appropriate dashboard when in).
  The go-to-market website is a separate future build on its own host.
- **`AppRoutes`** — everything else, wrapped in `AuthProvider` →
  `VenueProvider` → `AuditDateProvider` → `DashboardLayout`.

Post-login navigation goes to `/`, and `AppRoutes`' default-route logic picks
the destination — don't duplicate that decision in the login handler.

### Auth and venue resolution

`VenueContext` (`src/contexts/VenueContext.tsx`) is the centre of gravity and
the easiest place to break things.

- Venue access is earned through `venue_staff` **only**. `tabless_admin` grants
  the Admin section and nothing else.
- Active-venue resolution: saved `localStorage` selection → `is_primary` →
  auto-pick if exactly one venue → otherwise the chooser. Admins only ever get
  the saved selection.
- It queries through a **separate session-scoped Supabase client** and
  refetches only when `user.id` changes — not on token refresh, which would
  wipe in-flight Settings forms. Preserve both behaviours.
- Sensitive `venues` columns are not selectable by `authenticated`; use the
  `get_venue_admin_detail` RPC. Don't replace `VENUE_COLUMNS` with `*`.
- A signed-in user with no venue and no role is signed straight back out.

### Four independent authorisation layers

| Layer | Source | Enforced by | Controls |
|---|---|---|---|
| **Package tier** | `venue_feature_flags.tier` + `flags` | `RequireFeature`, `useFeatures` | What the venue bought. Fails closed to base `bite` tier. |
| **Role nav** | `venue_role_permissions.nav_keys` | sidebar rendering only | Which nav items a role sees. |
| **Per-user order actions** | three booleans on `venue_staff` | `Orders.tsx` | status / re-open / refund buttons. |
| **Platform admin** | `user_roles.role = 'tabless_admin'` | `RequireAdmin` | `/admin/*`. |

`nav_keys` is **presentation only** — `/orders`, `/menu` etc. carry no route
guard; RLS is the real boundary. The legacy order-action columns on
`venue_role_permissions` are dead; the live flags are per-user on
`venue_staff`. Venue owners short-circuit to full access in `usePermissions()`.

### Edge functions

56 functions. `_shared/` helpers: `ai.ts` (see below), `ai-usage.ts`,
`api-auth.ts`, `rate-limit.ts`, `require-feature.ts`, `safe-error.ts`,
`url-guard.ts`, `secure-compare.ts`, `loyalty-engine.ts`, `pos-adapter.ts`.
`adapters/`: `hl_exceed` (primary POS), `doshii`, `lightspeed`, `square`,
`mock`. Groups: POS sync (~14, with outbound queue + DLQ), Stripe AR (~11), AI
(~12), `adyen-payment`, partner API, scheduled ticks.

**Trap: which functions are public is invisible in this repo.**
`supabase/config.toml` has no `[functions.*]` blocks; every `verify_jwt`
setting lived in Lovable's dashboard and was never exported. Public-by-design
ones authenticate via HMAC / API key / token — read the function body, and when
deploying to the VYNU project, write the `verify_jwt = false` blocks into
`config.toml` first (candidate list in the cutover runbook, Phase 0.3/5).

### The AI layer — `_shared/ai.ts`

**Every AI call goes through this module.** Call sites ask for a *role*
(`chat`, `chat-advanced`, `image`, `image-edit`), never a vendor model string,
and consume an OpenAI-chat-completions-shaped result. Never fetch an AI
endpoint directly from a function.

Providers, selected by env (Supabase secrets):

1. **Default:** the Lovable gateway (Gemini models) — legacy, still the
   fallback until secrets change.
2. **Any OpenAI-compatible endpoint:** `AI_GATEWAY_URL` + `AI_API_KEY`.
3. **Anthropic (Claude):** `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`
   routes all chat roles through the Messages API (official SDK, pinned).
   Model per role via `AI_MODEL_CHAT` / `AI_MODEL_CHAT_ADVANCED` (claude-* ids;
   default `claude-opus-5`; `claude-haiku-4-5` is the margin-safe option for
   the high-volume diner path). The adapter drops `temperature`, floors
   `max_tokens` at 4096 (thinking counts against it), and disables thinking on
   forced tool calls. **Not yet runtime-tested.**

**Image roles always use the gateway** — Claude does not generate images; those
stay on Gemini models. Usage/cost logs to `ai_usage_log`, priced from
`ai_model_prices` — a model id without a price row logs as zero cost, which
silently corrupts platform financials.

Still Lovable-coupled: `connector-gateway.lovable.dev` (Firecrawl in
`landing-from-url`, the Lightspeed adapter) and the `LOVABLE_API_KEY` default.

---

## Product rules that are not negotiable

**Payments brand.** User-visible payments product is **VYNU Pay**. The
underlying processor — Adyen, and the internal Valpay platform — must **never**
appear in any user-visible surface. Internal identifiers deliberately keep old
names (`adyen-payment` function, `AdyenDropin.tsx`, `provider: "adyen"` rows,
the `ShyndigPayDropin` export). Leave them.

**No raw card form, ever (PCI SAQ A).** Card entry is exclusively the hosted
Drop-in iframe or a wallet. `adyen-payment` rejects any `create_payment`
carrying a `card` field. If the Drop-in can't load on a real venue, payment is
blocked — never degraded to a PAN form. Venue billing (AR) is separately on
Stripe hosted Checkout. Docs: `docs/pci/`. Note the TPSP register still names
Lovable as app host — stale, pending Kent's sign-off to say Vercel.
Mock-payment trap: a venue with `merchant_status='pending'` or missing
credentials silently runs **mock** payments that look successful.

**QR codes are permanent.** They encode stable table UUIDs intended for
printed stickers. Never regenerate or invalidate an existing QR URL. (No
physical stickers exist yet as of 2026-08-16 — but the code contract stands.)
`VITE_PUBLIC_APP_URL` is the canonical QR host and must never derive from the
current origin; move it to a customer-facing domain **before** the first
sticker is printed.

**Legacy identifiers stay.** `shyndig`, `sippa`, `tabless` persist from earlier
brand names — `tabless_admin`, `tabless_active_venue`, `SippaAnalytics.tsx`
(surfaced as "Vee AI Analytics"), the `ai.spark_analytics` feature key. Renaming
them breaks stored-data contracts for zero user-facing gain. Only user-visible
strings carry VYNU / VYNU Pay / Vee.

**White-labelling is per-deployment, not in-app.** Brands must never be visible
to each other. Do not add brand tables or brand-switching logic; brand
differences live in env/deploy config.

---

## Conventions

- Path alias `@/` → `src/`. Vite dedupes react/react-dom/TanStack Query.
- Query defaults in `App.tsx`: 1 min `staleTime`, 5 min `gcTime`, no refetch on
  focus, one retry.
- Tests colocated (`*.test.ts[x]`), jsdom. Prefer pure helpers in `src/lib/`.
- Edge-function errors surface via `src/lib/function-errors.ts` — 4xx bodies
  shown, 5xx bodies never (they can leak exception text). The same rule inside
  functions is `_shared/safe-error.ts` / `AiError.publicMessage`.
- `src/integrations/supabase/types.ts` and `client.ts` are **generated** — do
  not hand-edit. Regenerate against the VYNU project after schema changes
  (`npx supabase gen types typescript --linked`).
- Brand assets: `public/brand/vynu-mark.png` is the source of truth; the
  `vynu-*.svg` lockups embed it as base64 (SVG via `<img>` can't fetch external
  refs). Favicons derive from the designer's app icon.

## Further context

- `docs/migration/lovable-cutover.md` — the Lovable exit runbook, phase status
  current as of 2026-08-16. Read it before touching deploys, secrets, or the
  remaining Lovable couplings.
- `docs/pci/` — incident response, secret rotation, TPSP register.
- `.lovable/memory/` and `.lovable/plan/` — historical Lovable notes. Useful as
  archaeology; brand names in them are two generations stale (Shyndig → H&L
  OrderNOW → VYNU).
