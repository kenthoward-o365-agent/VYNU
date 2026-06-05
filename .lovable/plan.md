## CoPilot — Venue AI Assistant

A floating chat assistant ("CoPilot") available across the venue dashboard. Staff can ask natural-language questions about live operations, analytics, financials, and knowledge base content. Single rolling conversation per user, admin-only by default with per-role override.

---

### 1. UI surface

- **Floating launcher**: bottom-right `MessageCircle`-style button with a small "CoPilot" label badge, present on all venue routes (mounted in `DashboardLayout`). Hidden on consumer and admin routes.
- **Chat panel**: slide-in sheet (right side, ~440px wide on desktop, full-screen on mobile) built with AI Elements (`Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Tool`, `Shimmer`).
- **Header**: "CoPilot" name, generated CoPilot logo (purple), "Clear conversation" action.
- **Empty state**: 4 example prompts ("What was last night's revenue?", "Top 5 selling items this week", "Any unpaid invoices?", "How do I refund an order?").
- **Tool activity**: collapsed by default, shows tool name + ✓/⚠ status.

### 2. Permissions

- New permission key `copilot.use` added to `venue_role_permissions` seed.
- Default: granted to `owner` and `manager` roles only.
- Configurable per role in existing `RolesManager`.
- `useHasPermission('copilot.use')` gates the launcher render and the edge function rejects unauthorized callers.

### 3. Conversation storage

Single rolling thread per user per venue.

New table `copilot_conversations`:
- `user_id`, `venue_id`, `messages jsonb` (AI SDK `UIMessage[]`), `updated_at`
- Unique on `(user_id, venue_id)`
- RLS: owner-only (`auth.uid() = user_id`), service_role full
- "Clear" action wipes `messages` to `[]`

### 4. Backend — edge function `copilot-chat`

- AI SDK `streamText` via Lovable AI Gateway, model `google/gemini-3-flash-preview`.
- System prompt establishes CoPilot persona (helpful, concise, Aussie-friendly, never invents numbers), current venue context (name, timezone, currency), and tool-use guidelines.
- Auth: verifies JWT, loads staff record, checks `copilot.use` permission for the active venue.
- Persists assistant reply to `copilot_conversations` in `onFinish`.
- Logs token usage via existing `_shared/ai-usage.ts` with `feature: 'copilot'`.
- `stopWhen: stepCountIs(50)` for tool loops.

### 5. Tools (all scoped to caller's venue via service-role client + venue_id guard)

**Operations**
- `get_live_orders(status?, since?)` — open/in-progress orders, ticket times, table info
- `get_active_sessions()` — table_sessions currently open with totals
- `get_staff_alerts(unresolved?)` — recent alerts
- `get_menu_summary(query?)` — search menu_items / categories

**Analytics & performance**
- `get_revenue(range, breakdown?)` — totals, by hour, by day, by item, by staff
- `get_top_items(range, limit?)` — bestsellers
- `get_ticket_times(range)` — avg/median prep + delivery
- `get_abandonment(range)` — abandoned cart stats
- `get_table_utilization(range)`

**Financials (admins only — extra guard inside tool)**
- `get_invoices(status?, range?)` — venue_invoices
- `get_payments(range?)` — venue_invoice_payments
- `get_subscription_status()` — plan, status, next bill date
- `get_ar_summary()` — outstanding, overdue, dunning state

**Knowledge base**
- `search_knowledge_base(query, limit?)` — semantic search over KB articles using pgvector

### 6. Knowledge base RAG

- Add `embedding vector(3072)` column to existing KB articles table (or new `knowledge_base_chunks` table if articles are long).
- One-time backfill edge function `kb-embed-backfill` chunks (~1000 chars w/ overlap) and embeds via `google/gemini-embedding-001`.
- Trigger or webhook re-embeds on article create/update.
- `search_knowledge_base` tool embeds the query and returns top matches with title + snippet + link.

### 7. Files

**New**
- `supabase/migrations/*_copilot_conversations.sql` — table + RLS + grants
- `supabase/migrations/*_kb_embeddings.sql` — pgvector + embedding column + match function
- `supabase/migrations/*_copilot_permission.sql` — add `copilot.use` permission seed
- `supabase/functions/copilot-chat/index.ts` — streaming chat + tools
- `supabase/functions/kb-embed-backfill/index.ts` — one-off embed job
- `supabase/functions/kb-embed-article/index.ts` — re-embed on change
- `src/components/copilot/CoPilotLauncher.tsx` — floating button
- `src/components/copilot/CoPilotPanel.tsx` — sheet w/ AI Elements chat
- `src/components/copilot/CoPilotMessage.tsx` — message + tool rendering
- `src/assets/brand/copilot-icon.svg` — generated mark
- `src/hooks/use-copilot.ts` — `useChat` wrapper, conversation load/save

**Edited**
- `src/components/DashboardLayout.tsx` — mount `<CoPilotLauncher />`
- `src/components/venue/RolesManager.tsx` — surface `copilot.use` toggle
- AI Elements components installed via `bun x ai-elements@latest add conversation message prompt-input shimmer tool`

### 8. Out of scope (future)

- Write actions (refunding orders, updating menu) — read-only for v1
- Cross-venue queries for group operators
- Voice input
- Proactive notifications ("Sales are 30% below last Friday")

### Technical notes

- Uses existing `_shared/ai-gateway.ts` provider helper pattern from other functions.
- All tools return compact JSON (numbers formatted, no raw row dumps > 50 rows).
- Financial tools re-check `has_role(auth.uid(), 'admin')` server-side regardless of `copilot.use`.
- Embedding column sized 3072 to match `google/gemini-embedding-001` default.
- Conversation panel mounted once at layout level so it persists across route changes.
