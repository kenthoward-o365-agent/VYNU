

# Make Site ID a Browser-Recognized Credential Field

## Problem
Browsers use the `autocomplete` and `name` attributes to decide which fields to save in password managers. Currently, the Site ID field has no `name` or `autocomplete` attribute, so browsers either ignore it or confuse it with the email field when offering to save credentials.

## Fix

### `src/pages/Auth.tsx` — Add proper HTML attributes to all three login fields

| Field | Attributes to add |
|-------|-------------------|
| **Site ID** | `name="organization"`, `autoComplete="organization"`, `id="site-id"` |
| **Email** | `name="username"`, `autoComplete="username"`, `id="email"` |
| **Password** | `name="password"`, `autoComplete="current-password"`, `id="password"` |

The `organization` autocomplete hint tells browsers this is a separate credential dimension — like a company or workspace ID. Chrome, Safari, and Firefox all recognize it and will store it alongside the username/password tuple. This means when a user returns and the browser autofills, it will populate all three fields correctly.

For the sign-up form, the password field should use `autoComplete="new-password"` instead so browsers offer to generate a strong password.

### Why `organization`?
The HTML spec defines `autocomplete="organization"` for exactly this use case — a company/site identifier that's part of the login context but isn't the username. Password managers like 1Password and Bitwarden also recognize this token.

## Files changed
| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Add `name`, `autoComplete`, and `id` attributes to Site ID, email, and password fields |

