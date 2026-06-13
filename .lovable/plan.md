# POS Terminal Redesign — Venue + Admin Shell

Transform the entire authenticated venue and admin experience so it looks and behaves like a dark, professional POS terminal (Lightspeed/Revel inspired) **while preserving the existing H&L OrderNOW logo and color palette** (H&L Blue `198 70% 55%`, H&L Green `87 50% 51%`, Ink `203 42% 21%`, plus the existing dark sidebar tokens). No new brand colors are introduced — the chassis is built from deepened shades of the existing dark tokens, and the H&L Blue stays the active/accent color throughout. Consumer (`/order/...`), Auth, BillingSetup, ResetPassword, and Developers remain untouched.

## What the user will see

```text
┌──────────────────────────────────────────────────────────────────┐  ← subtle dark bezel (existing dark token, deepened)
│ [H&L logo]  Venue: Bondi Bistro · #1042 · Lunch Shift           │
│             Sarah K · Manager        Sat 13 Jun · 14:32:07     │  ← status bar
├──────┬───────────────────────────────────────────────────────────┤
│ ▢ Da │                                                           │
│ ▣ Or │           ACTIVE PAGE CONTENT                            │
│ ▢ Me │           (Dashboard / Orders / Menu …)                  │
│ ▢ Ta │                                                           │
│ ▢ Di │                                                           │
│ ▢ Se │                                                           │
│      ├───────────────────────────────────────────────────────────┤
│ ⏻    │ Online · Printer OK · Card Terminal Ready   v1.0  Sign Out│  ← footer rail
└──────┴───────────────────────────────────────────────────────────┘
```

- **Bezel**: 8–12px chassis frame around the app viewport using a deeper shade of the existing `--sidebar-background` (no new color), slightly rounded inner screen, subtle inner highlight, soft outer shadow. Desktop only; tablet/mobile collapses bezel to a thin border so usable area is preserved.
- **Logo**: existing `/brand/shyndig-icon.png` (H&L OrderNOW) rendered in the top-left of the status bar at terminal-appropriate size. No new logo, no recolor.
- **Sidebar = tile nav**: each item is a chunky square-ish tile (icon on top, label beneath), darker base derived from `--sidebar-accent`, **H&L Blue accent strip + tinted icon** when active, blue hover glow. Two stacked groups (Operations, then Group + Admin when applicable) separated by hairline dividers and small uppercase labels — same items, same order, same icons as today.
- **Top status bar**: split into left (logo + venue name, site ID, shift), right (user name + role badge, live date + ticking clock HH:MM:SS in tabular-nums).
- **Footer rail**: connection dot (H&L Green when online, destructive when offline), printer + card-terminal status, version, Sign Out, theme toggle, sidebar pin toggle, Co-Pilot button.
- **Typography**: unchanged — keep current sans, add `tabular-nums` only on the clock and numeric status counters so they feel terminal-grade.
- **Palette source of truth**: `src/index.css` tokens stay as-is. New tokens added below are HSL derivations of existing tokens only.

## Scope

In scope: every route rendered by `DashboardLayout` (venue + admin + group).
Out of scope: `Auth`, `ResetPassword`, `ConsumerOrder`, `BillingSetup`, `Developers`, all `src/components/consumer/*`. Business logic, routes, RLS, edge functions — untouched.

## Implementation

1. **New `POSTerminalShell` wrapper** (`src/components/pos/POSTerminalShell.tsx`)
   - Outer `div` with bezel styling (existing-token gradient border, inset ring, drop shadow), centered with `max-w-[1600px]` on very large screens, full-bleed below `lg`.
   - Renders top `POSStatusBar`, body slot (sidebar + content), footer `POSStatusFooter`.
2. **`POSStatusBar`** (`src/components/pos/POSStatusBar.tsx`)
   - Left: H&L logo (existing asset), venue name, site ID (from `venue.site_id`), shift label (placeholder "Lunch Shift" derived from current hour until shift data is wired).
   - Right: user display name + role (from `usePermissions` / `useAuth`), live date + clock via `useEffect` ticking each second.
   - Admin mode: shows "Platform Admin" + selected venue context if any.
3. **`POSStatusFooter`** (`src/components/pos/POSStatusFooter.tsx`)
   - Online/offline indicator (`navigator.onLine` + event listeners), printer + card-terminal placeholders ("Ready") until real signals exist, app version from `import.meta.env.VITE_APP_VERSION || 'v1.0'`, theme toggle, Sign Out, Co-Pilot trigger.
4. **`POSSideNav`** (`src/components/pos/POSSideNav.tsx`)
   - Replaces the navigation portion of `DashboardLayout` with tile-style buttons. **Same nav arrays (`venueNavItems`, `groupNavItems`, `adminNavItems`), same icons (existing SVG nav icons keep their light/dark variants), same active-path logic** — just restyled. Two widths: 88px (icon+label tile) default, 64px collapsed (icon only). Pin toggle preserved.
   - Active tile uses H&L Blue (`--primary`) strip + tinted icon; inactive uses `--sidebar-muted`.
5. **Refactor `DashboardLayout.tsx`**
   - Keep all logic (idle logout, onboarding banner, copilot, venue switching, permissions). Replace JSX scaffolding (`<aside>` + `<header>` + main) with `<POSTerminalShell sidebar={<POSSideNav …/>} statusBar={<POSStatusBar …/>} footer={<POSStatusFooter …/>}>{children}</POSTerminalShell>`.
   - Move venue switcher dropdown into the status bar (click venue name → existing dropdown). Mobile drawer behavior preserved.
6. **Tokens** (additive only — no existing token changes): add terminal-specific CSS vars in `src/index.css` under `:root` and `.dark`, all HSL derived from existing palette:
   - `--pos-chassis` (deeper shade of sidebar bg), `--pos-chassis-edge` (existing border), `--pos-screen` (existing background), `--pos-tile` (= sidebar-accent), `--pos-tile-active` (= primary @ low alpha), `--pos-status-bar` (= sidebar bg), `--pos-led-on` (= H&L Green / success), `--pos-led-off` (= destructive).
7. **Theme behavior**: respect the user's existing theme toggle — the chassis renders correctly in both light and dark using the existing token system. Default still follows current `ThemeContext`; no forced override.
8. **No route changes, no data changes, no new dependencies, no new colors, no new logo.**

## Technical notes

- All new files under `src/components/pos/`. Pages keep rendering inside `<DashboardLayout>{children}</DashboardLayout>` as today.
- Clock uses a single `setInterval(1s)` in `POSStatusBar`, cleared on unmount; formatted with `Intl.DateTimeFormat` (Australia/Sydney with user-locale fallback).
- Sidebar tile dimensions: 80×72px expanded, 56×56px collapsed; active state uses `box-shadow: inset 3px 0 0 hsl(var(--primary))`.
- Bezel: `border: 10px solid hsl(var(--pos-chassis)); border-radius: 22px; box-shadow: inset 0 0 0 1px hsl(var(--pos-chassis-edge)), 0 30px 60px -20px hsl(var(--foreground) / 0.4);`. Collapses below `lg`.
- Page padding inside the "screen" matches today's so no page layouts break.
- Co-Pilot panel and IdleTimeoutModal continue mounting at the layout root (outside the bezel) so overlays cover the chassis too.

## Out of scope / follow-ups

- Real printer + card-terminal status wiring (placeholder "Ready" for now).
- Shift schedule inferred from clock until a real shift table is wired.
- Consumer mobile app unchanged (Phase 2 per project memory).
