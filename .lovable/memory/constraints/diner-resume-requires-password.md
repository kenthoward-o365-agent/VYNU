---
name: Diner resume requires password
description: After tab close, the diner Resume Gate must require password re-entry — never silent auto-resume or tap-to-confirm only.
type: constraint
---
When a diner returns to /order/:venueId/:tableId and Supabase still has a valid session in localStorage but no active sessionStorage visit (i.e. tab/browser was closed), the Resume Gate MUST require the diner to re-enter their password (via `supabase.auth.signInWithPassword`) before we treat them as that diner. Do NOT downgrade this to a tap-to-confirm "Continue as X?" button without explicit user approval.

**Why:** Prevents silent identity carry-over on shared/handed-around devices and on personal phones left at a table. The Supabase token alone is not a sufficient identity check across tab-close boundaries for an ordering+payment surface (saved cards, order history, prefs).

**How to apply:** `src/components/consumer/DinerResumeGate.tsx` renders a password form; `src/pages/ConsumerOrder.tsx#handleResumeContinue` re-authenticates before calling `writeDinerVisit` and `setStarted(true)`. "Not you?" still signs out and opens normal sign-in.
