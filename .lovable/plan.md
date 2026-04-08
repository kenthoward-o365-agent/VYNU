
# Sippa AI Phase 2

## 1. Venue Knowledge Base
Instead of crawling websites (complex infra), we add a **venue context** text field to `venue_ai_config` where operators paste info about their venue — story, specialties, chef background, ambiance, events, wine list notes, etc. This gets injected into the system prompt so Sippa can answer questions like "Tell me about the chef" or "Do you have live music?".

### Database
- Add `venue_context` text column to `venue_ai_config`

### UI
- New "Venue Knowledge" textarea section in Sippa AI settings with guidance on what to include

### Edge Function
- Inject `venue_context` into system prompt

---

## 2. Order Another Round
When a diner says "another round" or "same again", Sippa looks up their last order items and adds them to cart.

### How it works
- Pass `diner_id` and `last_order_items` (from client) to the edge function
- Add instruction to system prompt about the "another round" capability
- When AI detects reorder intent, it returns the previous items via `[ADD_ITEMS]`
- Client already handles `ADD_ITEMS` → cart

### Changes
- `AIChatOverlay` passes `dinerId` + last order items
- `ConsumerOrder` passes these props
- Edge function prompt updated

---

## 3. Get the Manager
When a diner says "get the manager" or "I need to speak to someone", Sippa creates a staff alert.

### Database
- New `staff_alerts` table: `id`, `venue_id`, `table_id`, `alert_type` (enum: manager_request, assistance, complaint), `message`, `status` (pending/acknowledged/resolved), `created_at`, `resolved_at`, `resolved_by`
- Enable realtime on this table
- RLS: staff can view/update for their venue, public can insert

### How it works
- Edge function detects manager request intent via a new `[CALL_MANAGER: reason]` tag
- Returns `call_manager: true` + reason in response
- Client creates a row in `staff_alerts`
- Sippa responds warmly: "I've let the team know — someone will be right over"
- **Operator side**: Orders page shows a notification badge when alerts are pending (future: dedicated alerts panel)

---

## 4. Check Splitting
When a diner says "split the bill" or "split between 4", Sippa handles it conversationally.

### How it works (simplified for Phase 2)
- This is a **conversational flow only** — actual payment splitting requires Adyen integration (Phase 3)
- Sippa asks how many ways to split, calculates per-person amount, and displays it
- Returns `[SPLIT_CHECK: N]` tag which the client renders as a split summary card
- No actual payment processing — just information display for now

### Edge Function
- Add split check instructions to system prompt
- Parse `[SPLIT_CHECK: N]` tag

### Client
- Render a "Split Summary" card in chat showing per-person amounts

---

## Files Changed
- **Migration**: Add `venue_context` to `venue_ai_config`, create `staff_alerts` table + realtime
- **`SippaAISettings.tsx`**: Add venue knowledge textarea
- **`diner-chat/index.ts`**: All prompt updates, new tags
- **`AIChatOverlay.tsx`**: Handle manager alerts, split display, pass diner context
- **`ConsumerOrder.tsx`**: Pass dinerId and last order to chat
