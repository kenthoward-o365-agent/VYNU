

## Fix the overlap between "Ordrup Loyalty" and the Loyalty tab

You're right — the two systems are stepping on each other. Today:

- The **Loyalty tab** (per venue) creates and edits *custom* programs like *The Pass* and *Morris House*.
- The **Ordrup Loyalty editor** (Group Settings) loads "the most recently updated active program" for the same scope and edits **the same row** — that's why renaming it changes The Pass.
- The **"Ordrup Loyalty" toggle** in Group Settings is wired to `global_diners` (cross-venue diner recognition) — wrong field, wrong concept.
- The **"Global Loyalty Programs"** toggle exists in Group Settings but does nothing on the Loyalty tab.

The fix is to make Ordrup Loyalty its **own first-class program** that lives separately from any custom programs, and move the on/off switch where it belongs — onto the Loyalty tab, where it overrides custom programs when active.

### New mental model

```text
┌─ Loyalty Tab (per venue / per group) ──────────────────────┐
│                                                             │
│  ┌─ Ordrup Loyalty (built-in) ───────────────[ ON / off ]┐ │
│  │ Ordrup's free built-in program. When ON, this is the  │ │
│  │ active program for diners — your custom programs      │ │
│  │ below are paused.                                     │ │
│  │ [ Configure Program → ] (opens the sectioned editor)  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ── Custom Loyalty Programs ──────────────────────────────  │
│  (paused while Ordrup Loyalty is ON)                        │
│  • The Pass                  [ Active / Paused ]            │
│  • Morris House Rewards      [ Active / Paused ]            │
│  [ + New Program ]                                          │
└─────────────────────────────────────────────────────────────┘
```

Group Settings keeps **only** the cross-venue toggles (global diner recognition, global loyalty pooling) — no more loyalty mechanics there.

### What changes

**1. Mark the Ordrup Loyalty program in the database**

Add a `is_ordrup_builtin BOOLEAN DEFAULT false` column to `loyalty_programs`. The editor only ever loads/creates the row where `is_ordrup_builtin = true` for a given scope. This is what stops it from clobbering *The Pass*.

Backfill: leave all existing rows (`The Pass`, `Morris House`) as `false`. They become "custom programs" — never touched by the Ordrup Loyalty editor again.

**2. Move the Ordrup Loyalty on/off switch to the Loyalty tab**

Remove the *Ordrup Loyalty* and *Global Loyalty Programs* rows from:
- `AdminVenueDetail.tsx` → Group Settings tab
- `GroupDashboard.tsx` → Settings tab

Keep the existing **Global Diner Recognition** behaviour (under its real name) and **Global Loyalty Pooling** (cross-venue points sharing) — both are *separate concerns* and stay in Group Settings, just renamed correctly.

**3. Redesign the Loyalty tab (`src/pages/Loyalty.tsx`)**

Top section becomes the Ordrup Loyalty card:
- Switch toggling the built-in program's `is_active`
- "Configure Program →" button opens `ShyndigLoyaltyEditor` in a dialog (or expands inline)
- When ON, show a clear notice: *"Ordrup Loyalty is your active program. Custom programs below are paused for diners."*

Below it, the existing custom-program list — unchanged, but with a "Paused while Ordrup Loyalty is on" overlay state when the built-in is active.

For group admins (parent venues), this same Loyalty tab on the parent venue manages the **group-scoped** Ordrup Loyalty program; child venues see it as read-only with "Managed by {Group}".

**4. Make "active program resolution" Ordrup-aware**

Update `get_active_loyalty_program(venue_id)` to prefer the built-in program when it's active:
1. Group's Ordrup Loyalty (if active and not opted out)
2. Group's custom programs
3. Venue's Ordrup Loyalty (if active)
4. Venue's custom programs

So flipping the Ordrup Loyalty switch genuinely overrides the custom plan diners see at checkout / in their profile.

**5. Group Settings cleanup**

In `AdminVenueDetail.tsx` (Group Settings tab) and `GroupDashboard.tsx` (Settings tab), the *Diner & Loyalty Settings* card becomes:

```text
┌─ Diner & Loyalty Settings ─────────────────────────────────┐
│                                                             │
│  Global Diner Recognition                          [ on ]  │
│  Diners signing up at one venue are recognised at all      │
│  venues in this group.                                     │
│                                                             │
│  Global Loyalty Pooling                            [ off ] │
│  Points earned at one venue can be redeemed at any         │
│  sibling venue (requires a group-level program).           │
│                                                             │
│  → Configure your loyalty program in the Loyalty tab.      │
└─────────────────────────────────────────────────────────────┘
```

The "Configure Ordrup Loyalty" card here is **removed** — the editor now lives only on the Loyalty tab.

## Files to change

| File | Change |
|------|--------|
| New migration | Add `loyalty_programs.is_ordrup_builtin BOOLEAN DEFAULT false`; update `get_active_loyalty_program` to prefer built-in when active |
| `src/components/venue/ShyndigLoyaltyEditor.tsx` | Filter load/save by `is_ordrup_builtin = true`; new programs created with the flag set |
| `src/pages/Loyalty.tsx` | New top section: Ordrup Loyalty toggle + Configure button + dialog; existing custom-program list shown below with "paused" state when built-in is on |
| `src/pages/AdminVenueDetail.tsx` | Remove Ordrup Loyalty switch + Configure card from Group Settings; restore *Global Diner Recognition* label; clarify Global Loyalty Pooling copy |
| `src/pages/GroupDashboard.tsx` | Same cleanup — remove the Ordrup Loyalty config card and rename the toggle |
| `src/pages/VenueSettings.tsx` | Remove the inline ShyndigLoyaltyEditor card (it now lives on the Loyalty tab) |
| `src/components/consumer/CheckoutPanel.tsx` | Already uses the resolver — no change needed |

## What happens to existing data

- **The Pass** and **Morris House Rewards** stay exactly as they are, become "custom programs" on the Loyalty tab. No rename, no data loss, balances preserved.
- A new **Ordrup Loyalty** row is created (or reused) the first time anyone clicks *Configure* on the Loyalty tab. Defaults to **off** — so nothing changes for diners until you turn it on.
- When you turn Ordrup Loyalty **on**, it becomes the active program at checkout and *The Pass* gets a "Paused" badge in the UI (its `is_active` is unchanged — only the resolver hides it).

## Expected result

- Renaming Ordrup Loyalty no longer affects *The Pass*.
- The Loyalty tab is the single place to manage all loyalty — Ordrup's built-in plus any custom programs.
- Group Settings only holds the cross-venue *behaviour* toggles (diner recognition, pooling).
- A venue can keep using *The Pass* (Ordrup Loyalty stays off), or flip the switch to use Ordrup's free built-in plan instead — without losing their existing program.

