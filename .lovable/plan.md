## Goal

When a returning diner hits the Resume Gate (valid Supabase session in `localStorage` but no active tab visit), require them to **re-enter their password** before we treat them as that diner. "Not you?" still signs out and opens normal sign-in.

This brings the resume flow up to the security level of a fresh sign-in, while keeping the same-tab continuous session frictionless.

## UX

`DinerResumeGate.tsx` becomes a mini sign-in card:

```
[avatar/icon]
Welcome back, {firstName}
{email shown, read-only}

[ password input            ]
[ Continue as {firstName}   ]   ← primary, disabled until password entered

Forgot password?
Not you? Sign in with a different account
```

- **Continue** → calls `supabase.auth.signInWithPassword({ email, password })`. On success: `writeDinerVisit(...)`, hydrate diner, proceed to menu.
- Wrong password → inline error, password field cleared, no lockout beyond Supabase's own rate limits.
- **Forgot password?** → sends reset email via `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })` and shows a confirmation toast. Diner stays on the gate.
- **Not you?** → unchanged: `supabase.auth.signOut()` then open `DinerSignup` in `signin` mode.

## Why password (not just tap-to-confirm)

You asked for password. This matches the strictest of the earlier options (Option A) and removes the silent-identity-carry-over risk completely — even if someone picks up an unlocked phone with a valid Supabase token, they can't resume without knowing the password.

## Technical changes

### 1. `src/components/consumer/DinerResumeGate.tsx` (modify)
- Add `password`, `submitting`, `error` state.
- Add `email` (already passed in) as the sign-in identifier; render read-only.
- Replace the single "Continue" button with a small form: password `<Input type="password">` + submit button.
- Add "Forgot password?" link beneath the form.
- Change `onContinue` prop signature to `onContinue(password: string) => Promise<void>` so the parent does the actual `signInWithPassword` call and surfaces auth errors back via thrown error / return value.

### 2. `src/pages/ConsumerOrder.tsx` (modify)
- `handleResumeContinue` (currently a no-arg callback at ~line 287) becomes `async (password: string)`:
  1. `await supabase.auth.signInWithPassword({ email: dinerEmail, password })`.
  2. On error → re-throw so the gate shows inline error.
  3. On success → `writeDinerVisit(venueId, dinerId)`, `setShowResumeGate(false)`, continue existing hydration path.
- Make sure we already have the diner's email available when rendering the gate (we do — it's passed to `DinerResumeGate` today).

### 3. No DB / edge-function changes
- Pure client-side change layered on existing Supabase auth + the existing visit/gate plumbing.

### 4. Memory
- Add a short constraint memory: "Diner resume after tab close requires password re-entry, not just tap-to-confirm." So future changes don't silently downgrade this.

## Out of scope (can revisit later)

- 3DS/CVV step-up on saved-card payments — discussed separately, not part of this change.
- Biometric / WebAuthn passkey resume as a faster alternative to password.
- Lockout after N failed attempts (Supabase already rate-limits).

## Files

- **Modify**: `src/components/consumer/DinerResumeGate.tsx`
- **Modify**: `src/pages/ConsumerOrder.tsx` (only `handleResumeContinue`)
- **Create**: `.lovable/memory/constraints/diner-resume-requires-password.md`
