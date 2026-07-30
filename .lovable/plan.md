# Pub+ on the QR ordering app + Pub+ API placeholder

## Short answer

Mostly no new venue-level setup is needed — Pub+ is deliberately a parent/group-owned program, and child venues inherit it. But there are three real gaps that stop a diner signing up for Pub+ from the QR app today, plus the integrations placeholder you asked for.

## What already works

- `get_active_loyalty_program(venue_id)` resolves Pub+ first for every child venue, ignoring venue opt-outs, so the in-session join prompt already targets Pub+.
- `get_active_loyalty_programs_for_venue(venue_id)` returns group programs for any venue in the group, so Pub+ shows in the diner profile and auto-enrol list.
- Balances live on the shared program row, so points earned at one venue redeem at any venue in the group.

## Gaps to fix

1. **Signup silently skips Pub+.** `DinerSignup` only enrols a diner into group programs when the group's `settings.global_loyalty` flag is true. A group that turned Pub+ on via the Pub+ tab but never flipped the older `global_loyalty` toggle gets no enrolment. Fix: treat a Pub+ program as always opted-in (bypass the `global_loyalty` filter for it), matching the "no opt-out" rule the parent toggle already enforces.

2. **The join prompt writes the balance from the client.** `LoyaltyJoinPrompt` inserts straight into `loyalty_balances` with a client-supplied `signup_bonus`. Switch it to the server-authoritative `enroll_diner_in_loyalty` RPC (same call signup already uses), so the welcome bonus comes from the program rules.

3. **Generic loyalty copy.** When the resolved program is Pub+, the prompt and the venue landing reward card should speak the Pub+ language: earn 1 point per $1 at any venue in the group, 200 points = a $10 pub+ coin, welcome bonus, and "your points work across every venue" — instead of "our loyalty program". Also surface the group's configured member deals in the prompt when present. No barcode/app download anywhere — sign-in is the whole point of the pitch.

## Venue-level surface

No new venue toggle (the parent owns the switch). Instead, on the venue's Loyalty settings add a small read-only Pub+ status card: program name, that it is group-managed, earn rate and coin threshold, member count at this venue, and a note that it cannot be disabled locally. This is informational so venue managers understand what diners see.

## Pub+ API integration placeholder (Admin Panel)

Add a `pubplus` entry to the integrations surface in the Admin Panel, alongside the POS providers, presented as a distinct "Loyalty / rewards" integration rather than a POS adapter:

- Status badge: **Planned — not connected**.
- Description of the intended two-way sync: member identity match, points balance sync, and reward/coin redemption against the ALH Pub+ API.
- Disabled fields for API base URL, partner/merchant ID, and API key, with a note that credentials will be stored as backend secrets when ALH provides them.
- Link out to pubplus.com.au.

No credentials, no network calls, no database writes — purely a placeholder card so the integration path is visible when pitching ALH.

## Technical notes

- Files: `src/components/consumer/DinerSignup.tsx`, `src/components/consumer/LoyaltyJoinPrompt.tsx`, `src/components/consumer/VenueLanding.tsx`, `src/pages/AdminIntegrations.tsx` (new `PubPlusIntegrationCard` component), and the venue Loyalty settings page for the read-only status card.
- Pub+ detection on the client: the resolver RPCs return the program row; select on `is_pubplus` / `rules.program === "pubplus"`.
- No schema migration required — `is_pubplus`, the group-scoped resolver, and shared balances are already in place.
