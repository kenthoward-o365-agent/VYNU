
## Self Onboard Agent — plan

A full-screen, AI-native onboarding wizard that walks a venue from "fresh account" to "live for diners" in one sitting. Powered by Lovable AI (Gemini 3 Flash) with a curated set of safe action tools, a live readiness scorecard, and a Go-Live gate.

## 1. Entry point

- New **"Self Onboard"** button in the top bar (`DashboardLayout.tsx`), immediately left of the Knowledge Base icon. Sparkle/rocket icon + label, pulsing primary highlight while onboarding is incomplete.
- Visible only to roles with **Manage Settings** (Owners/Managers).
- Visibility rules:
  - **Show** while `venue_onboarding_state.status` is `in_progress`.
  - When readiness hits 100%, agent prompts: *"You're ready — hide the Self Onboard button?"* Yes → status `completed`. No → button stays.
  - User can always hide manually from a kebab in the wizard ("Hide for now" / "I'm done") → status `dismissed`. Re-show via Settings → Onboarding.
  - Day-end close no longer required as the trigger (per the answers above), but we record `first_dayend_at` for analytics.

## 2. Page & layout

- Route: `/onboarding` (full-screen, no sidebar — own layout).
- Two-pane:
  - **Left (40%)** — vertical checklist of stages, each with status pill (Not started / In progress / ✅ Done / ⚠️ Needs attention), % progress bar at the top, big **Go Live** button at the bottom (disabled until all blockers green).
  - **Right (60%)** — AI chat using the established `useChat`-style pattern (AI Elements: `Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Shimmer`, `Tool`). Streaming responses, markdown, tool-call cards rendered inline.
- On open, the agent greets the operator by venue name, runs a silent readiness scan, and suggests the highest-impact next step.

## 3. Onboarding stages (the checklist)

Each item has: title, why-it-matters blurb, current status, deep-link "Open in app", and "Have the agent do it" chat shortcut.

| # | Stage | Blocker for go-live? | Readiness signal |
|---|---|---|---|
| 1 | Venue details (name, type, address, phone, hours, timezone, logo) | Yes | `venues` row populated |
| 2 | Menu — at least 1 category + 5 items with price | Yes | counts from `menu_categories` / `menu_items` |
| 3 | Modifiers (optional but recommended) | No | `modifier_categories` count |
| 4 | Tables + QR generated | Yes | `tables` count ≥ 1 |
| 5 | Taxes configured (GST/AU default) | Yes | `venue_taxes` row exists |
| 6 | H&L Pay onboarding submitted + approved | Yes | `venue_payment_config.status = approved` |
| 7 | Surcharges & gratuities | No | `venue_payment_config` surcharge fields |
| 8 | **POS decision** — "Use H&L OrderNOW Orders only" *or* "Push orders to H&L Exceed POS" | Yes | new `venue_onboarding_state.pos_choice` enum |
| 9 | If POS push chosen → H&L credentials configured + test order succeeded | Yes (conditional) | `venue_pos_integrations.status = connected` + last `pos_sync_log.test_order = success` |
| 10 | AI agent name, tone, opening message, venue context | Yes | `venue_ai_config` populated |
| 11 | Order statuses & Display Areas reviewed (defaults OK) | No | seeded by default; just confirm |
| 12 | Staff invited with roles | No | `venue_staff` count ≥ 2 |
| 13 | Test end-to-end: scan QR → order → pay → kitchen sees it → refund | **Go-live ritual** | `onboarding_test_run.passed = true` |
| 14 | Branding & Landing page (optional polish) | No | landing page sections count |

## 4. AI agent capabilities

System prompt frames the agent as "H&L OrderNOW's onboarding specialist". It can:

**Answer questions** about any platform feature, using Knowledge Base content as grounded context (vector / keyword lookup over the venue KB sections we already built — including the new H&L POS section).

**Read tools** (no approval needed, called automatically to ground responses):
- `get_readiness()` → returns the checklist with status, blockers, %.
- `get_venue()` / `get_menu_summary()` / `get_tables()` / `get_pos_status()` / `get_payment_status()`.

**Action tools** (each requires user confirmation in chat — `needsApproval: true`):
- `set_venue_details({ name?, address?, phone?, hours?, timezone? })`
- `add_table({ number, zone?, capacity? })` (loop for bulk via `add_tables_bulk`)
- `add_tax({ name, percent, inclusive })`
- `set_ai_config({ agent_name, tone, opening_message, venue_context })`
- `set_pos_choice({ choice: 'ornow_only' | 'push_to_hl' })`
- `set_hl_pos_credentials({ integrator_id, recipient_id, station_no, client_id, client_secret, shared_secret, default_tender_code? })` — secrets handled server-side, never echoed back.
- `send_hl_test_order()` — calls existing `pos-hl-test-order`.
- `toggle_auto_push_orders({ enabled })`
- `invite_staff({ email, role })`
- `import_menu_from_file({ file_id })` — wraps existing `import-menu` function.
- `mark_onboarding_complete()` / `dismiss_onboarding()`
- `request_go_live()` — flips venue from test → live only when all blockers pass.

Tools run server-side in the chat edge function with full RLS-scoped checks. `stopWhen: stepCountIs(50)`.

## 5. Conversational flows we explicitly script

The system prompt seeds opinionated openers so the agent doesn't waste time:

1. *"What's your POS vendor?"* — if not H&L Exceed → ask whether they want H&L OrderNOW to be the source of truth for orders, and mark stage 8/9 N/A.
2. *"Will orders be managed in H&L OrderNOW or pushed to your POS?"* — sets `pos_choice`, gates stage 9.
3. *"Got an existing menu? Drop the PDF/photo here and I'll import it"* — file upload in chat → `import_menu_from_file`.
4. *"Tell me your tables — '12 tables, 1–10 main floor, P1–P2 patio' works"* — agent parses and calls `add_tables_bulk`.
5. *"What tax rate applies? (AU default: 10% GST inclusive)"* — one-tap accept.
6. *"Let's give your AI agent a name and tone."*
7. *"Want to invite your team now? Paste emails one per line with a role."*
8. *"Ready for a test run?"* — opens guided 6-step smoke test, marks pass/fail.
9. Go Live confirmation.

At any point the operator can ask anything ("How do refunds work?", "What does throttling do?") and get a KB-grounded answer with a deep-link.

## 6. Readiness score + Go-Live gate

- `useOnboardingReadiness()` hook runs the checks (cached, refetches on focus + after every agent tool call).
- Score = blockers complete / total blockers; 100% required for Go Live.
- **Go Live** button:
  - Disabled with tooltip listing missing blockers when <100%.
  - On click: confirmation modal → flips `venues.is_live = true`, `venue_payment_config.mode = 'live'` (if approved), logs `onboarding_go_live` event, and shows celebration screen.
- Test-mode banner shown across the operator app until Go Live.

## 7. Backend — new tables, functions, edge functions

### Migration
```sql
-- 1. Onboarding state per venue
create table public.venue_onboarding_state (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  status text not null default 'in_progress',          -- in_progress | completed | dismissed
  pos_choice text,                                      -- ornow_only | push_to_hl | other_pos
  pos_vendor_other text,
  readiness_snapshot jsonb,                             -- last computed checklist
  first_dayend_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.venue_onboarding_state to authenticated;
grant all on public.venue_onboarding_state to service_role;
alter table public.venue_onboarding_state enable row level security;
create policy "managers read/write own venue onboarding"
  on public.venue_onboarding_state for all to authenticated
  using (is_venue_manager(auth.uid(), venue_id))
  with check (is_venue_manager(auth.uid(), venue_id));

-- 2. Onboarding chat history (thread per venue)
create table public.onboarding_chat_messages (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null,                                   -- user | assistant | tool
  parts jsonb not null,                                 -- UIMessage parts
  created_at timestamptz not null default now()
);
-- + grants + RLS scoped to is_venue_manager
-- + index on (venue_id, created_at)

-- 3. Test-run results
create table public.onboarding_test_runs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  steps jsonb not null,                                  -- [{step, passed, evidence}]
  passed boolean not null default false,
  ran_at timestamptz not null default now()
);
-- + grants + RLS
```

### Edge functions
- `onboarding-chat` — streaming AI SDK route. Uses Lovable AI Gateway (`google/gemini-3-flash-preview`), loads venue + readiness snapshot into system prompt, exposes the tools above, persists messages to `onboarding_chat_messages`.
- `onboarding-readiness` — single source of truth for the readiness computation (also used by Go-Live gate).
- `onboarding-go-live` — flips venue to live after re-validating blockers server-side.

All tools route through these functions; secrets like `client_secret` go straight to existing `admin-set-pos-credentials` / `HLPosPanel` save path — agent never holds them in memory.

## 8. Frontend

- `src/pages/Onboarding.tsx` — new full-screen wizard, replaces the existing thin Onboarding placeholder.
- `src/components/onboarding/`:
  - `ChecklistPane.tsx` — stage cards, status pills, go-live button.
  - `OnboardingChat.tsx` — AI Elements `Conversation` + tool-call cards + custom tool result renderers (e.g. table-import summary, test-order request/response, readiness table).
  - `GoLiveDialog.tsx` — final confirmation + celebration.
  - `useOnboardingReadiness.ts` — client cache + revalidation.
- `DashboardLayout.tsx` — add Self Onboard button (Rocket icon), reads onboarding status, hides when `completed` or `dismissed`.
- `KnowledgeBase.tsx` — new section "Onboarding & Going Live" explaining the agent for self-serve refresh.

## 9. Out of scope (future)
- Multi-language onboarding.
- Voice mode for the chat.
- Onboarding analytics dashboard for H&L OrderNOW admins (time-to-live, drop-off stages).
- Re-onboarding wizard for major feature launches.

## 10. Files (summary)

**New**
- migration: `venue_onboarding_state`, `onboarding_chat_messages`, `onboarding_test_runs`
- `supabase/functions/onboarding-chat/index.ts`
- `supabase/functions/onboarding-readiness/index.ts`
- `supabase/functions/onboarding-go-live/index.ts`
- `src/pages/Onboarding.tsx` (replace placeholder)
- `src/components/onboarding/*` (4 components + hook)

**Edited**
- `src/components/DashboardLayout.tsx` — Self Onboard button.
- `src/App.tsx` — `/onboarding` route already exists; wire to new page.
- `src/pages/KnowledgeBase.tsx` — new "Onboarding & Going Live" section.
- `supabase/config.toml` — register new functions.

Approve and I'll build it stage-by-stage: migration + readiness function first, then chat function + tools, then the wizard UI, then the Go-Live gate.
