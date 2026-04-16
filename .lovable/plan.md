

## Goal

Make Site ID optional on `/auth`. If the signed-in user is a `tabless_admin`, skip the Site ID requirement entirely and let them through to `/admin/dashboard`.

## Approach

The cleanest UX: keep one form, but make Site ID optional. On submit:

1. Sign in first with email + password.
2. After sign-in succeeds, check `user_roles` for `tabless_admin`.
   - If admin → ignore Site ID (even if entered), don't set `tabless_active_venue`. `App.tsx` already routes admins via `isTablessAdmin` and `defaultRoute` lands them on `/admin/dashboard`.
   - If not admin → require Site ID. If missing or invalid, sign them out and show the existing error. If valid, set `tabless_active_venue` and proceed.

This avoids the chicken-and-egg of "do the Site ID lookup before knowing who you are" while keeping a single, simple form.

### UI changes in `src/pages/Auth.tsx`

- Site ID input: drop `required`, change placeholder to `Venue ID (e.g. 1000) — leave blank for OrdrUp staff`, update helper text to `Operators: enter your venue's Site ID. OrdrUp staff: leave blank.`
- Card description: `Sign in to your venue dashboard or OrdrUp admin console`
- Submit logic order:
  1. `signInWithPassword(email, password)` — bail on error
  2. Check `user_roles` for `tabless_admin` for the signed-in user
  3. Branch:
     - Admin: clear any stale `tabless_active_venue`, toast `Welcome, OrdrUp admin`, done
     - Non-admin + no Site ID: `signOut()`, toast `Site ID is required for venue operators`
     - Non-admin + Site ID: run existing `lookup_venue_by_site_id` RPC; on miss, `signOut()` + toast; on hit, set `tabless_active_venue` and done

### No changes needed elsewhere

- `App.tsx` already routes admins to `/admin/dashboard` via `defaultRoute = isTablessAdmin ? "/admin/dashboard" : "/dashboard"` and the unprovisioned-account guard already skips users who are `isTablessAdmin`.
- `VenueContext` already detects `tabless_admin` and grants access without a `venue_staff` row.

## Files to change

- `src/pages/Auth.tsx` — only file touched

## Out of scope

- Separate "OrdrUp staff sign-in" toggle UI (option 3 from earlier list)
- Admin invite/bootstrap flow (option 4)

