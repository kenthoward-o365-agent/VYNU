

## Root cause

`App.tsx`'s guard `if (!venue && !isTablessAdmin) { signOut + flag "not provisioned" }` is firing **before** `VenueContext.fetchVenues` has a chance to load the user's venue/role data after sign-in.

Sequence:
1. User signs in → `AuthContext.user` becomes truthy.
2. React re-renders. `VenueContext`'s `useEffect([user])` is **scheduled** but hasn't run yet.
3. At this render, `venueLoading=false` (left over from the pre-login "no user" branch which sets `setLoading(false)`), `venue=null`, `isTablessAdmin=false`.
4. `App.tsx` guard sees `!venue && !isTablessAdmin` → calls `supabase.auth.signOut()` and sets the `ordrup_not_provisioned` flag.
5. User is bounced back to `/auth` with the "Account not provisioned" banner — even though their data in DB is perfectly fine.

I confirmed in the DB that all three test accounts are correctly provisioned (one `tabless_admin`, two active venue owners). The auth logs also show the pattern: every login is followed by an immediate logout. This is a regression introduced by adding the auto-signout guard.

## Fix

Make `VenueContext.loading` start as `true` again whenever `user` changes, so the guard waits for the fetch to complete.

In `src/contexts/VenueContext.tsx`:

- In the `useEffect([user])`, **before** scheduling `fetchVenues`, synchronously call `setLoading(true)` for the case where `user` exists. This way, the very next render after sign-in sees `venueLoading=true`, and `App.tsx` shows the "Loading..." screen instead of firing the guard.

Concretely, replace:

```ts
useEffect(() => { fetchVenues(); }, [user]);
```

with:

```ts
useEffect(() => {
  if (user) setLoading(true);   // block the guard until fetchVenues finishes
  fetchVenues();
}, [user]);
```

Belt-and-braces hardening in `src/App.tsx`: only fire the unprovisioned-signout once we've actually attempted a fetch. Track this by also requiring `!venueLoading` (already done) AND ensuring we don't run the guard on the *initial* user-set tick. The `setLoading(true)` change above is sufficient and the cleaner fix; no change to `App.tsx` should be needed.

## Files to change

- `src/contexts/VenueContext.tsx` — one-line change in the `useEffect`

## Out of scope

- Any change to RLS, schema, or the admin-vs-operator branching logic in `Auth.tsx` (those are working correctly)

## Expected result

- Admin sign-in (no Site ID) → lands on `/admin/dashboard`, no false "not provisioned" message
- Operator sign-in (with Site ID) → lands on `/dashboard`, no false "not provisioned" message
- The "not provisioned" message still correctly appears for users who genuinely have no `venue_staff` row and no `tabless_admin` role

