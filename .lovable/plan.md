
## Problem

The current `/auth` flow is a single shared screen for both venue operators and diners. When anyone hits `Auth.tsx` and clicks "New venue? Create an account", they sign up via `signUp()` which creates an `auth.users` row. Because they have no `venue_staff` record, `App.tsx` then routes them to `Onboarding.tsx`, which forces them to create a venue. That's wrong for diners.

Diners should only ever sign up / sign in inside the **consumer mobile flow** (the `/order/:venueId/:tableId` route — `ConsumerOrder.tsx`, which uses `DinerSignup.tsx`). They must never see the operator `Auth.tsx` or `Onboarding.tsx`.

## Root cause

`src/pages/Auth.tsx` exposes a generic "Create an account" toggle that is reachable by anyone landing on the operator app URL. There is no separation between:
- Operator/staff accounts (created by an admin via `admin-create-user` edge function, or by an authorized owner)
- Diner accounts (created only inside the consumer order flow)

## Plan

### 1. Lock `/auth` to sign-in only (operator app)
In `src/pages/Auth.tsx`:
- Remove the "New venue? Create an account" toggle and all signup UI (display name field, isSignUp state, signUp call).
- Keep only: Site ID + email + password sign-in.
- Replace the toggle with a small note: "Diner? Scan your table's QR code to order." and a "Forgot password?" link.

This means no one can accidentally self-register as a venue from the operator URL.

### 2. Remove the public `Onboarding` route as a self-serve path
In `src/App.tsx`:
- Currently, any authenticated user without a venue is auto-routed to `Onboarding`. That's the trap.
- Change the logic: if a logged-in user has no `venue_staff` record AND is not a Tab-Less admin AND is not a diner with a `diner_profiles` row, sign them out and show an "Account not provisioned — contact your venue administrator" message on `/auth`.
- Keep `Onboarding.tsx` in the codebase but only reachable via an explicit admin-driven invite flow (future work — out of scope for this fix). For now, it just won't be auto-rendered.

### 3. Confirm diner signup stays inside the consumer flow
No change required: `DinerSignup.tsx` is already only mounted from `ConsumerOrder.tsx` (`/order/:venueId/:tableId`), which is a public route outside the `AuthProvider` operator stack. Diners signing up there get a `diner_profiles` row, not a `venue_staff` row.

### 4. Returning diners on mobile
Returning diners sign back in through the same consumer flow on `/order/:venueId/:tableId` — `DinerSignup.tsx` already handles both signup and sign-in for diners. Confirm it has a "returning diner" sign-in path; if missing, add a sign-in toggle inside `DinerSignup.tsx`.

I'll need to view `DinerSignup.tsx` during implementation to verify the returning-diner sign-in already exists. If it doesn't, I'll add a simple email+password sign-in toggle there.

## Files to change

- `src/pages/Auth.tsx` — strip signup UI, sign-in only
- `src/App.tsx` — remove auto-route to `Onboarding`; show "not provisioned" state instead
- `src/components/consumer/DinerSignup.tsx` — verify/ensure returning-diner sign-in exists (read first, then decide)

## Out of scope (future)

- Admin-invite flow to provision new venue owners (replacement for self-serve onboarding)
- Removing `Onboarding.tsx` entirely

## Expected result

- Operator URL (`/auth`) only allows sign-in with Site ID + email + password
- No path from the operator app creates a venue accidentally
- Diners only ever sign up / sign in via the QR-code consumer flow on mobile
- Returning diners sign back in through the same consumer mobile flow
