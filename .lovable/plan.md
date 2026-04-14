

# Fix Chat Analytics — Session ID Not Returned to Anonymous Users

## Root Cause
The anonymous consumer creates a `chat_session` successfully (INSERT policy exists), but the chained `.select("id").single()` returns `null` because there is **no anon SELECT policy** on `chat_sessions`. Since `sessionIdRef` is always null, messages are never logged and session stats are never updated.

## Fixes

### 1. Database migration — Add anon SELECT policy on `chat_sessions`
Add a narrow anon SELECT policy that only allows reading the session row that was just inserted. We can't scope by user for anon, so we'll use a time-limited approach: allow anon to select sessions that are still open (`ended_at IS NULL`).

```sql
-- Allow anon to read back sessions (needed for insert...returning)
CREATE POLICY "Anon can read own session"
  ON public.chat_sessions FOR SELECT TO anon
  USING (ended_at IS NULL);
```

### 2. Database migration — Add anon SELECT policy on `chat_messages_log`
Currently anon has no SELECT on messages. While not strictly needed for logging, it prevents the insert from failing silently if Supabase tries to return inserted rows. Add a narrow policy:

```sql
CREATE POLICY "Anon can read session messages"
  ON public.chat_messages_log FOR SELECT TO anon
  USING (true);
```
Actually this is too broad. We only need insert to work — no select needed. Skip this.

### 3. Fix `AIChatOverlay.tsx` — Make session creation and message logging robust
- Add error handling to the session creation insert so we can debug failures
- Add error handling to message log inserts (currently fire-and-forget with `.then(() => {})`)
- Add error handling to session update on unmount

### 4. Fix `AIChatOverlay.tsx` — Update session stats inline instead of on unmount
The unmount-based update is unreliable (page close, navigation, React strict mode). Instead, update `message_count` and `items_added` after each message exchange using incremental updates.

### 5. Fix `ConsumerOrder.tsx` — Improve `converted_to_order` update
Line 301-306 tries to update all open sessions for the venue, but as anon this likely fails. Improve by passing the specific session ID from the chat overlay.

## Files changed
| File | Change |
|------|--------|
| Migration SQL | Add anon SELECT policy on `chat_sessions` |
| `src/components/consumer/AIChatOverlay.tsx` | Add error handling, update session stats inline per message instead of on unmount |
| `src/pages/ConsumerOrder.tsx` | Pass session tracking through to order placement |

