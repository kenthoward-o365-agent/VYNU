

## Plan: Persistent Diner Session During Visit

### Problem
Supabase auth already persists sessions in localStorage (`persistSession: true`), so the diner stays authenticated across page refreshes and QR re-scans. However, the `started` state in ConsumerOrder always defaults to `false`, forcing the diner to tap through the VenueLanding screen every time — even if they're already signed in.

### Solution
On initial load in `ConsumerOrder.tsx`, check for an existing auth session. If the diner is already signed in with a valid diner profile, auto-set `started = true` to skip the landing page and go straight to the menu/order view.

### Changes

**`src/pages/ConsumerOrder.tsx`**
- In the existing `fetchDinerProfile` useEffect (line 124), when a session and diner profile are found, also call `setStarted(true)` so returning/signed-in diners bypass the landing screen automatically.
- This means: scan QR → already signed in → land directly on the menu feed (or active order if one exists).

No database changes needed. No new tables or columns. The Supabase client already handles token refresh and session persistence natively.

### What the diner experiences
1. First visit: scan QR → see landing → sign up/in → browse & order
2. Same visit, scan QR again (or refresh): scan QR → straight to menu (session persists in localStorage)
3. Return visit days later: same — session persists until explicit sign-out or token expiry

