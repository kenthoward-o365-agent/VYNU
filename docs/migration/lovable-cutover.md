# Migrating H&L OrderNOW off Lovable

A step-by-step cutover from the Lovable-managed stack to infrastructure you own.

**Written 2026-08-14.** Every claim here was verified against the repo at commit
`54cd583`. Where something could not be verified from the repo — anything that
lives only in Lovable's dashboard or the live database — it is marked
**[verify]** and you must check it before relying on it.

---

## What you are actually migrating

Four separate dependencies, not one. Transferring the database alone leaves you
with a working ordering app whose AI silently fails.

| # | Dependency | Where it lives | Verified by |
|---|---|---|---|
| 1 | **Postgres** | Lovable Cloud project `hjcikekaythqjhcuznjf` | `.env`, `supabase/config.toml` |
| 2 | **AI gateway** | `ai.gateway.lovable.dev/v1/chat/completions` — 12 edge functions | `grep -l ai.gateway.lovable.dev supabase/functions/*/index.ts` |
| 3 | **Connector gateway** | `connector-gateway.lovable.dev` — Firecrawl, Lightspeed | `grep connector-gateway supabase/functions` |
| 4 | **Repo sync** | Lovable's bot commits to the GitHub repo | commit `e2c2660` |

Order matters. Phases 0–2 are reversible and touch nothing live. The first
irreversible act is Phase 9.

---

## Phase 0 — Decisions and backups (do this first, change nothing)

### 0.1 QR codes — not a constraint (confirmed 2026-08-14)

Ordinarily this is the constraint that governs the whole migration: QR codes
encode an absolute URL on a physical sticker, and if that host is a
`*.lovable.app` domain it can never be repointed, because Lovable owns the DNS.
That would mean either keeping a Lovable frontend deployed forever as a
redirector, or reprinting every sticker.

**It does not apply here.** All existing QR codes are virtual and were generated
for testing only — nothing is printed and nothing is on a table. The migration is
therefore free to move `VITE_PUBLIC_APP_URL` to a host you own, and Phase 10 can
fully retire Lovable.

Two things follow:

1. **Set the QR host to a domain you control before the first sticker is
   printed.** The window is open now and closes permanently the day a venue goes
   live on physical stickers.
2. The product rule still stands in code — `src/pages/Tables.tsx:17-25`
   deliberately does not derive the host from the current origin, and existing
   `tables.qr_code` values are returned verbatim. Don't "simplify" that away
   because today's data is disposable.

To confirm the position before you rely on it:

```sql
select split_part(qr_code, '/order/', 1) as host, count(*) as tables
from public.tables
where qr_code is not null
group by 1 order by 2 desc;
```

### 0.2 Export the secrets

These are referenced by the edge functions but exist **only** in Lovable's secret
store — they are in no file in this repo. Copy them somewhere safe (a password
manager, not this repo, not a chat window):

```
LOVABLE_API_KEY          STRIPE_SECRET_KEY        STRIPE_WEBHOOK_SECRET
CRON_SECRET              TWILIO_ACCOUNT_SID       TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER       DOSHII_CLIENT_ID         DOSHII_CLIENT_SECRET
LIGHTSPEED_API_KEY       PUBPLUS_EE_CLIENT_SECRET PCI_CHECK_BASE_URL
APP_URL
```

Most are re-issuable from the vendor, but you need the *current* values to avoid
killing live Stripe webhooks mid-cutover.

### 0.3 Record which edge functions are public **[verify]**

`supabase/config.toml` contains only `project_id`, so every `verify_jwt` setting
lives in Lovable's dashboard and **cannot be recovered from this repo**. When you
redeploy to your own project, every function defaults to `verify_jwt = true`, and
each one that should have been public breaks — webhooks stop arriving, the diner
chat 401s, cron jobs fail. Silently, and only in production.

Open the Edge Functions list in the Supabase/Lovable dashboard and write down the
JWT-verification setting for all 57. That list is the authority.

From code analysis, these are the ones that almost certainly must be public —
use it to sanity-check the dashboard, not to replace it:

- **Diner path (no auth):** `diner-chat`, `send-receipt-sms`, `pubplus-air`,
  `ar-verify-onboarding-token`
- **Cron-invoked (bearer `CRON_SECRET`, not a JWT):** `session-tick`,
  `throttle-tick`, `process-job-queue`, `pos-outbound-worker`,
  `ar-generate-invoices`, `ar-charge-due-invoices`, `partner-webhook-dispatch`,
  `pci-page-integrity-check`
- **External callers (HMAC / API key):** `pos-hl-webhook`, `pos-order-webhook`,
  `ar-stripe-webhook`, `pos-product-sync`, `adyen-payment`, `landing-from-url`,
  `csp-report`, `partner-pos`, `partner-crm`, `mcp`

### 0.4 Take a full backup

Before anything else, get a complete dump you control. You need the connection
string from the Lovable backend settings.

```bash
pg_dump --no-owner --no-privileges "$LOVABLE_DATABASE_URL" > lovable-full-backup-$(date +%Y%m%d).sql
```

Store it outside the repo. This is your rollback for everything that follows.

---

## Phase 1 — Stand up your own Supabase project ✅ DONE (2026-08-14)

Project `ewdjxdfgvpdcctqikdcy`, org VYNU, region `ap-southeast-2` (correct for
Australian venues), Postgres 17. Extensions are created by the migrations
themselves — see Phase 2.

---

## Phase 2 — Replay the schema ✅ DONE (2026-08-14)

```sh
npx supabase link --project-ref ewdjxdfgvpdcctqikdcy
npx supabase db push
```

All 227 migrations applied. Verified against the original:

| | Original | VYNU |
|---|---|---|
| Tables | 113 | 113 — **zero missing** |
| Enums | 14 | 14 |
| RLS policies | — | 364 |
| Functions | — | 126 |
| Triggers / indexes | — | 77 / 384 |
| Cron jobs | — | 4 |

`pg_cron`, `pg_net`, `pgmq` and `pgcrypto` all installed.

**Four defects had to be fixed first**, and they are the reason this phase was
worth doing early rather than during a cutover window. Three were state the
Lovable database had that no migration creates — runtime-created log partitions,
and `pg_cron`/`pg_net` enabled by hand in the dashboard months before the only
`CREATE EXTENSION` statements were written. The fourth was a latent ordering bug:
hand-authored migrations carry timestamps that do not reflect when they were
applied, so two pairs had never actually run in filename order before. See commit
`1810eed` and the four `*_replay_*.sql` migrations.

**The database is empty of data.** Phase 3 is what fills it.

---

## Phase 3 — Move the data

Schema replay gives you an empty database.

```bash
pg_dump --data-only --no-owner --disable-triggers \
  --exclude-table-data='public.api_request_log*' \
  --exclude-table-data='public.pos_sync_log*' \
  --exclude-table-data='public.ai_usage_log' \
  "$LOVABLE_DATABASE_URL" > data.sql

psql "$NEW_DATABASE_URL" -f data.sql
```

`--disable-triggers` matters: the schema has 43 files' worth of triggers, and
letting them fire during a bulk load will corrupt derived state and re-enqueue
jobs. The excluded tables are high-volume logs — bring them across only if you
need the history.

`auth.users` is a separate concern **[verify]**: Supabase auth data does not move
with a `public`-schema dump, and `venue_staff.user_id` references it. Confirm
your export includes the `auth` schema, or every operator login breaks. This is
the most common way a Supabase migration fails.

---

## Phase 4 — Re-enter the Vault secrets (they do not migrate)

**Vault ciphertext is undecryptable in a new project.** Supabase Vault encrypts
with a project-scoped key that Supabase manages; the encrypted bytes survive a
dump and become permanently unreadable on the other side. Everything below must
be re-entered by hand:

| Secret | Set via | Scope |
|---|---|---|
| `project_url` | `vault.create_secret` | once |
| `cron_secret` | `vault.create_secret` | once |
| Payment credentials | `set_payment_secret()` | **per venue** |
| POS credentials | `set_pos_credential()` | **per venue** |
| POS webhook secrets | `set_pos_webhook_secret()` | **per venue** |
| Partner API webhook secrets | `create_api_webhook()` | per webhook |

Scope this before you start — the per-venue ones scale with how many venues are
live. Count them:

```sql
select count(*) from public.venues where is_active;
```

Payment credentials are the sensitive ones. Per `.lovable/memory/features/payments.md`
a venue with `merchant_status = 'pending'` or missing credentials silently runs in
**mock mode** — the diner taps Pay and the backend authorises against a mock flag,
collecting nothing. A venue that appears to work after migration may in fact be
taking no money at all. Check `merchant_status` explicitly rather than testing a
payment and seeing "success".

---

## Phase 5 — Deploy the edge functions

All 57 are in the repo, so this part is mechanical.

1. Write the `verify_jwt` settings from step 0.3 into `supabase/config.toml`
   **before deploying** — this is the step that is invisible in the repo today
   and the easiest to forget:

```toml
project_id = "<your-new-ref>"

[functions.pos-hl-webhook]
verify_jwt = false

[functions.diner-chat]
verify_jwt = false

# ... one block per public function from 0.3
```

2. Set the secrets from 0.2:

```bash
supabase secrets set STRIPE_SECRET_KEY=... CRON_SECRET=... TWILIO_ACCOUNT_SID=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not set them.

3. Deploy:

```bash
supabase functions deploy
```

---

## Phase 6 — Replace the AI gateway

The largest piece of actual engineering, and the one with no mechanical shortcut.

**12** functions call `ai.gateway.lovable.dev/v1/chat/completions` with
`LOVABLE_API_KEY`. (`adapters/lightspeed` also uses `LOVABLE_API_KEY`, but against
the *connector* gateway — it is not an AI call site.)

### Status: ✅ ALL 12 CALL SITES MIGRATED (2026-08-16)

Every AI call now goes through `supabase/functions/_shared/ai.ts`. Zero direct
references to `ai.gateway.lovable.dev` remain outside that module. Switching to
any OpenAI-compatible provider is env-only:

```
AI_GATEWAY_URL  AI_API_KEY  AI_MODEL_CHAT  AI_MODEL_CHAT_ADVANCED
AI_MODEL_IMAGE  AI_MODEL_IMAGE_EDIT
```

All twelve typecheck clean under `deno check`. Still NOT runtime-tested — no
local Supabase stack; exercise them against a deployed environment before
trusting the migration (the diner chat and menu import are the easiest to
smoke-test from the app).

Remaining Lovable AI-side dependency is the **connector gateway** only:
`landing-from-url` (Firecrawl scrape) and `adapters/lightspeed` still call
`connector-gateway.lovable.dev` with LOVABLE_API_KEY. Replacing those needs a
Firecrawl account and direct Lightspeed credentials respectively.

### Choosing a provider

The endpoint is OpenAI-compatible, so pointing at another OpenAI-compatible
provider needs no code change at all now — set `AI_GATEWAY_URL` and `AI_API_KEY`.
Moving to the Anthropic Messages API instead means writing one adapter inside
`aiChat`, which is the single place that knows the wire format.

Image generation needs separate thought either way: the image roles use Gemini
image models, which have no drop-in Anthropic equivalent.

Also repoint `connector-gateway.lovable.dev`: Firecrawl (`landing-from-url`,
`import-menu`) needs your own Firecrawl account, and the Lightspeed connector
needs direct Lightspeed API credentials.

**Note the cost change.** `ai_usage_log` and `ai_model_prices` exist to track
per-call spend, currently billed through Lovable. After the swap you are billed
directly by the provider — repopulate `ai_model_prices` with real rates or the
platform financials reporting will be wrong.

---

## Phase 7 — Storage, Auth and cron

**Storage.** One bucket: `venue-assets` (menu images, venue logos). The bucket
row is created by a migration; the objects are not. Copy them across and verify
the RLS policies on `storage.objects` came over with the migrations. **[verify]**

**Auth.** None of this is in the migrations — reconfigure by hand in the
dashboard:
- Redirect allowlist — must include your new frontend origin, or `/reset-password`
  and the OAuth consent flow break
- Email templates (password reset, invites)
- Any configured providers
- JWT expiry and session settings

**Cron.** The five `cron.schedule` calls replay with the migrations, but they read
`project_url` and `cron_secret` from Vault via `vault.decrypted_secrets` — so they
stay broken until Phase 4 is done. After setting them:

```sql
select jobname, schedule, active from cron.job order by jobname;
select jobname, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 20;
```

An empty `job_run_details` after an hour means the jobs are not firing.

---

## Phase 8 — Frontend and Vercel

1. Point `.env` at the new project: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
2. **Leave `VITE_PUBLIC_APP_URL` alone** until Phase 9. It decides where newly
   generated QR codes point; changing it early means stickers printed during
   migration point somewhere that isn't live yet.
3. Set the same four variables in the Vercel project (build-time, so a change
   requires a redeploy).
4. `vercel.json` is already in the repo — the SPA rewrite is what stops a QR scan
   cold-loading `/order/:venueId/:tableId` from 404ing.
5. Add the new origin to the Supabase redirect allowlist (Phase 7).
6. Re-verify the Apple Pay domain for the new host, or the wallet button silently
   stops rendering. `public/.well-known/apple-developer-merchantid-domain-association`
   is domain-scoped.

---

## Phase 9 — Cut over

Everything to here is reversible: the old stack is still live and serving. Run
both in parallel and verify against real data before switching.

Pre-cutover checklist:

- [ ] Operator login works, and a user lands in the right venue
- [ ] RLS verified as a **non-owner** staff user — an owner short-circuits to
      full access in `usePermissions()` and will not exercise the policies
- [ ] Diner flow end to end: QR scan → menu → order → payment → receipt
- [ ] A venue with real credentials takes a **real** payment (confirm
      `merchant_status` is not `pending`, per Phase 4)
- [ ] POS webhook received and processed; check `pos_webhook_events`
- [ ] An order pushes to H&L; check `pos_outbound_dlq` is empty
- [ ] All 13 AI functions return successfully
- [ ] Cron jobs firing (`cron.job_run_details`)
- [ ] Stripe webhooks arriving at the new endpoint

Then, in this order:

1. Repoint external webhooks (H&L POS, Stripe, Doshii) at the new function URLs.
2. Switch DNS / `VITE_PUBLIC_APP_URL` to the new host, per the 0.1 decision.
3. Keep the old stack running, untouched, for at least a full billing cycle.

**Rollback:** revert DNS and the webhook URLs. Any orders written to the new
database during the window will not exist in the old one — reconcile manually.
Keep the window short and pick a genuinely quiet trading period.

---

## Phase 10 — Retire Lovable

Only after a clean billing cycle. Note that this is the point of no return for
the repo sync, so make sure `supabase/migrations/` is intact in your own repo
first — a Lovable sync deleted all 223 files once already (commit `e2c2660`).

Because no physical QR stickers exist (step 0.1), nothing forces a Lovable
frontend to stay alive as a redirector. This retirement can be complete.

---

## Effort

Rough, assuming no surprises:

| Phase | Effort | Risk |
|---|---|---|
| 0 — decisions, backups | half a day | low, but 0.1 can force a rethink |
| 1–2 — project + schema | half a day | low; migrations do the work |
| 3 — data | 1 day | **high** — `auth.users` is the usual failure |
| 4 — Vault re-entry | scales per venue | **high** — silent mock-mode payments |
| 5 — functions | half a day | medium — `verify_jwt` fails silently |
| 6 — AI gateway | **2–4 days** | medium; the real engineering |
| 7 — storage/auth/cron | 1 day | medium |
| 8 — frontend | 2 hours | low |
| 9 — cutover | 1 day + soak | **high** |

The three that bite are `auth.users` (Phase 3), Vault re-entry masking dead
payments (Phase 4), and `verify_jwt` defaults (Phase 5) — all three fail
*silently*, which is why each phase above ends with an explicit verification.
