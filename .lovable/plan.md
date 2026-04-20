

# Goal — me&u-style universal diner identity ("Ordrup ID")

## How me&u works (and how we already line up)

me&u splits the diner side into two layers:

1. **me&u Profile** — one account (email + phone + name + allergens + saved cards). Created once, recognised at every me&u venue you scan.
2. **Pass / Pass+** — a *separate* loyalty layer venues opt into. Joining Pass at one venue ≠ joining at another (each venue runs its own program, but enrollment is one-tap because they already know who you are).

We already have the right shape:

- `diner_profiles` is **global** (no `venue_id`) — keyed off `auth.users.id`. Same login, every venue.
- `loyalty_programs` is **per venue** (or per group). Joining is a row in `loyalty_balances`.
- `diner_visits` already tracks cross-venue history.

What's missing is the **glue**: when a returning Ordrup ID scans a new venue's QR, we should silently recognise them, log a visit, and offer one-tap loyalty join — never re-asking name/email/phone.

## What we'll build

### 1. Brand the universal profile as "Ordrup ID"

- Rename the diner-side language across `DinerSignup`, `DinerProfile`, `LoyaltyJoinPrompt`:
  - "Create Account" → **"Create your Ordrup ID"**
  - Subtitle: *"One profile. Every Ordrup venue. Earn rewards everywhere you go."*
  - Sign-in title → **"Welcome back to Ordrup"**
- Add a small "Ordrup ID" chip in `DinerProfile` header showing the diner's display name + email.

### 2. Silent recognition on venue entry

In `ConsumerOrder.tsx`, when a session loads and the user is already authenticated:
- Look up `diner_profiles` by `user_id`.
- If found, **insert a `diner_visits` row for this venue** (already partially done in `DinerSignup`, but it currently only fires at signup/sign-in time — move it to session start so a returning diner who doesn't sign in again still gets credited).
- Pull their allergens/preferences from the profile and seed the dietary filter chips (so a vegan diner sees vegan-filtered menus automatically at every venue).

### 3. One-tap loyalty join at new venues

Today `LoyaltyJoinPrompt` shows post-checkout for guests only. Change it so:
- If diner is **signed in (has Ordrup ID)** AND the current venue/group has an active loyalty program AND they're **not already enrolled** → show a lighter "Join Sunset Bar Rewards — one tap" sheet with just the program name and a single **Join** button (no form, no fields, because we already have their info).
- If diner is a **guest** → existing full prompt (sign up first, then auto-enroll) stays the same.
- Tapping Join inserts into `loyalty_balances` with the program's `signup_bonus`.

### 4. "My Memberships" view in DinerProfile

Replace the current single-venue loyalty card with a **list of all programs the diner is enrolled in across every venue/group**:

```text
┌─ Your Ordrup ID ────────────────────┐
│ Jane Smith · jane@example.com       │
│ Member since Apr 2026 · 12 visits   │
└─────────────────────────────────────┘

Memberships (3)
  ★ Sunset Bar Rewards     124 pts
  ★ Coastal Group VIP      Gold tier
  ★ Pizza Co. Stamps       4 / 10

Recent venues
  Sunset Bar — 2 days ago
  Pizza Co. — last week
  Reef Cafe — last month
```

Driven by:
- `loyalty_balances` joined to `loyalty_programs` joined to `venues`/`venue_groups` for names.
- `diner_visits` grouped by venue, ordered by most recent.

### 5. Cross-venue saved cards (already 80% there)

`diner_stored_cards` is keyed off `diner_id`, not venue, so a card vaulted at Venue A is already reusable at Venue B (Adyen `shopperReference` = diner UUID). One copy tweak in `CheckoutPanel` — change the saved card section header from "Saved Cards" to **"Your Ordrup wallet"** so it's clear these travel with the diner.

### 6. Allergens sync everywhere

`diner_profiles.allergens` already exists. In the `DinerProfile` edit form, expose allergen chips. On menu load in `MenuFeed`, if a signed-in diner has allergens stored, auto-select those filter chips on first render (with a "Set by your Ordrup profile" tooltip and an easy clear).

## Out of scope

- Building a separate `pass_subscriptions` table for paid Pass+ (me&u's premium tier). Loyalty programs cover the equivalent free tier and that's enough for now — paid memberships can come later.
- Cross-venue order history feed (already trivially queryable, but UI polish for an "All my orders" tab is a follow-up).
- Marketing emails / push notifications to Ordrup ID holders.

## Database

No schema changes needed. All work uses the existing `diner_profiles` (global), `diner_visits`, `loyalty_programs`, `loyalty_balances`, `diner_stored_cards` tables. We will add **two RLS policies** so a signed-in diner can:
- `INSERT` into `diner_visits` for themselves (currently only staff can insert).
- `INSERT` into `loyalty_balances` for themselves (currently only staff can insert).

These are required so silent visit-logging and one-tap join work without an edge function.

## Files to change

| File | Change |
|------|--------|
| New migration | RLS policies: diners can self-insert into `diner_visits` and `loyalty_balances` |
| `src/components/consumer/DinerSignup.tsx` | Copy: "Ordrup ID" branding, cross-venue messaging |
| `src/components/consumer/DinerProfile.tsx` | "Ordrup ID" header card, full memberships list, all-venues visit list, allergen editor |
| `src/components/consumer/LoyaltyJoinPrompt.tsx` | New "signed-in one-tap join" variant; show on session start (not just post-checkout) when diner isn't enrolled at this venue |
| `src/pages/ConsumerOrder.tsx` | On session load with authed user → log visit; pass diner's allergens to `MenuFeed`; trigger join prompt if applicable |
| `src/components/consumer/MenuFeed.tsx` | Accept `defaultAllergens` prop and auto-apply on first render |
| `src/components/consumer/CheckoutPanel.tsx` | Rename "Saved Cards" → "Your Ordrup wallet" |

## Expected result

A diner scans their first Ordrup QR at Sunset Bar → creates their **Ordrup ID** (one form). They earn Sunset Bar Rewards points. Two weeks later they scan a QR at Pizza Co (also on Ordrup) → no signup, the menu is already filtered to their allergens, a small sheet says *"Join Pizza Co Stamps — one tap"*. They tap Join and they're in. Their saved card and profile travel with them. In **Profile**, they see one Ordrup ID with three memberships and every venue they've visited.

