## Problem

Diner accounts use Supabase Auth, which persists the session in `localStorage` indefinitely (default behaviour). When a member closes the tab and later re-scans the QR at a venue, `ConsumerOrder.tsx` calls `supabase.auth.getSession()`, finds the saved session, and silently treats them as logged in — skipping the sign-in screen entirely.

For a shared/handed-around table device, or a personal phone left on a cafe table, this is a privacy and ordering-integrity risk: someone else could scan, land in the previous diner's identity, see their saved prefs, and place orders on their account.

## Proposed Behaviour

Treat a diner's web session as **short-lived and bound to the active visit**. After any of the following, force the diner to sign in again the next time they hit `/order/:venueId/:tableId`:

1. **Tab/browser closed** — no active visit when they return.
2. **Idle timeout fired** — the existing 10-min inactivity flow ends the visit.
3. **Order completed + receipt dismissed** — visit is over.
4. **More than N hours since last activity**, even if Supabase still has a valid token.

The Supabase auth refresh token is still kept (so password re-entry isn't always required — see options below), but the diner must take an explicit action to "resume as {Name}" before the app treats them as that diner.

## UX Options (please pick one)

We'll ask via `ask_questions` after you approve the shape of this plan. The main choice is how strict to be:

- **A. Always require password** — every QR scan after tab close shows the sign-in form pre-filled with their email. Most secure, most friction.
- **B. "Continue as {Name}?" tap-to-confirm** — if Supabase still has a valid session, show a small confirmation card with their name/avatar and a "Not you? Sign in" link. One tap to resume, zero friction for the legit owner. Recommended.
- **C. Time-based** — auto-resume if last activity < 30 min ago; otherwise show the confirm card from option B; otherwise require password.

## Technical Plan

### 1. Track "active diner visit" separately from Supabase auth

Add a `sessionStorage` key (cleared automatically when the tab closes) per venue:
```
shyndig:diner_visit:{venueId} = { dinerId, startedAt, lastActivityAt }
```

`sessionStorage` (not `localStorage`) is the key choice — it dies with the tab, exactly matching "closed the web page".

### 2. Update `ConsumerOrder.tsx` diner-hydration effect

Change the effect at lines 212–271 so it does **not** auto-set `started = true` based on Supabase session alone. Instead:

```ts
const visit = readDinerVisit(venueId);          // sessionStorage
const { data: { session } } = await supabase.auth.getSession();

if (visit && session?.user) {
  // Same tab, mid-visit → fully resume silently.
  hydrateDiner(session.user.id);
  setStarted(true);
} else if (session?.user) {
  // Token still valid, but no active visit → show "Continue as X?" gate.
  hydrateDinerLight(session.user.id);            // name/avatar only
  setShowResumeGate(true);                       // new state
} else {
  // No token → existing signup/signin flow.
  setShowSignup(true);
}
```

### 3. New `DinerResumeGate.tsx` component

Small full-screen card shown before menu loads:
- "Welcome back, {first_name}"
- Primary button: **Continue as {first_name}** → writes the visit to sessionStorage, sets `started`, proceeds.
- Secondary link: **Not you? Sign in with a different account** → calls `supabase.auth.signOut()` then opens `DinerSignup` in `signin` mode.

### 4. Tie into existing idle/abandonment system

In `useDinerSession`, when the idle timeout fires (or `end_reason = 'idle_timeout' | 'tab_closed'`):
- Clear `shyndig:diner_visit:{venueId}` from sessionStorage.
- Optionally call `supabase.auth.signOut({ scope: 'local' })` if the user picked option **A**.

After a successful order + receipt close, also clear the visit key so the next QR scan re-gates.

### 5. No database changes required

This is purely a client-side gating change on top of the existing auth + session-tracking infrastructure. No migrations, no edge functions.

## Files to Edit / Create

- **Create**: `src/components/consumer/DinerResumeGate.tsx`
- **Create**: `src/lib/diner-visit.ts` (small read/write/clear helpers around sessionStorage)
- **Modify**: `src/pages/ConsumerOrder.tsx` — change diner hydration effect, render the resume gate, clear visit on order complete + on idle timeout.
- **Modify**: `src/hooks/use-diner-session.ts` — clear the visit key when the session ends.

## Open Question for You

Before I implement, please confirm the UX option (A / B / C above). Default recommendation is **B — Continue as {Name}? tap-to-confirm**, which matches how Uber Eats / DoorDash handle returning users on the same device while still preventing silent identity carry-over after a tab close.
