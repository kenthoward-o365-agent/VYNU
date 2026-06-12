## Goals

1. Settings becomes a **landing page of buttons** (Details, Users, Loyalty, H&L OrderNOW AI, Payments, Gratuities, Surcharges, Taxes, Table Sessions, Integrations, plus existing **Landing Page Editor**). No more long expanded list in the sidebar.
2. Left sidebar tightened so the nav fits without scrolling at common heights.
3. Accordion behaviour: only **one expanded group at a time** — opening another auto-closes the previous.

## Changes

### 1. Settings as a hub page

- Sidebar **"Settings"** entry becomes a plain link (no `hasSub`, no chevron, no collapsible). Clicking it goes to `/settings`.
- `src/pages/VenueSettings.tsx`: when there is **no `?tab=` query param**, render a new **SettingsHub** grid instead of the tabs UI. The hub is a responsive grid of large buttons (icon + title + one-line description), each routing to `/settings?tab=<key>`:
  - Details, Users, Loyalty, H&L OrderNOW AI, Payments, Gratuities, Surcharges, Taxes, Table Sessions, Integrations
  - **Landing Page Editor** card (routes to `/settings/landing-page` — its existing route).
- When `?tab=` is present, render the existing tabbed page **plus** a small "← Back to Settings" link at the top so users can return to the hub.
- No behaviour change to the actual tab contents.

### 2. Tighten the left sidebar (no scrolling)

In `src/components/DashboardLayout.tsx`, expanded-mode (`!pinned`) tweaks:
- Logo block: drop from `h-28` to `h-16`, reduce header padding from `p-4` to `px-3 py-2`, and tighten the venue-switcher button.
- Nav rows: reduce `py-2.5` to `py-1.5`, gap from `gap-3` to `gap-2.5`, font from `text-sm` to `text-[13px]`.
- Section labels (Group / Admin) from `pt-3 pb-1` to `pt-2 pb-0.5`.
- Sub-item rows from `py-1.5` to `py-1`, indentation `pl-10` → `pl-8`.
- Remove the now-unused Settings sub-list block (~lines 399–435).
- Keep the outer `overflow-y-auto` as a safety net for very small viewports.

### 3. Single-open accordion

Currently each top-level item that has sub-items renders its own uncontrolled `<Collapsible defaultOpen={...}>`, so multiple can be open at once.

- Lift state into the layout: `const [openGroup, setOpenGroup] = useState<string | null>(...)`.
- Initialise `openGroup` from the current route (e.g. `/diners/...` → `"diners"`, `/orders/...` → `"orders"`, `/menu` import/enhance → `"menu"`, etc.) and update it whenever the route changes.
- Convert each `Collapsible` to **controlled** mode: `<Collapsible open={openGroup === key} onOpenChange={(v) => setOpenGroup(v ? key : null)}>`. Opening one automatically closes the previously open one.
- The Settings group no longer exists in this list (it's a plain link now), so it's automatically excluded from accordion behaviour.

### Files

- `src/pages/VenueSettings.tsx` — hub view + back link, no changes to tab content.
- `src/components/DashboardLayout.tsx` — Settings = plain link, tighter spacing, controlled `Collapsible` groups sharing `openGroup` state, removed Settings sub-list.

No DB, edge function, or routing changes.
