

## Goal

Add an explicit **diner-side choice** at the start of the flow: order **solo** (private ticket, fires immediately as today), or **join the table's group order** (bundles with everyone else at this QR for one kitchen ticket). This sits in front of the Table Sessions backend from the previous plan — backend bundling only kicks in for diners who explicitly opt in.

## Updated diner workflow

```text
1. Diner scans QR for Table 12
2. VenueLanding loads
3. We check: is there an OPEN group session at Table 12 right now?
       NO  → show two options:    [Order on my own]   [Start a group order at this table]
       YES → show three options:  [Join Alice + Bob's group order (2 people)]
                                  [Order on my own anyway]
                                  [Start a fresh group]   ← rare, behind "more"
4. Diner picks → continues to landing CTAs (guest / signup / signin) → menu
5. Their choice is held in app state + persisted to localStorage keyed by venue+table
   so a refresh doesn't lose it
6. CheckoutPanel reads the choice:
       solo  → existing flow, no session_id stamped
       group → calls find_or_create_table_session, stamps session_id,
               CTA reads "Send to table" + shows "Holds with table for ~90s" pill
```

## Key UX rules

- **Default is solo.** Group is opt-in — never auto-join, even if a session exists. Avoids the "I just wanted a quick coffee and now I'm waiting for strangers" failure mode.
- **Switchable mid-session.** Add a small "Ordering mode" pill in the header that opens a sheet to switch modes — but only **before** their first order. After first order, mode is locked for that visit (changing it would orphan items).
- **Visual identity.** Group sessions get a colored stripe + a host avatar list at the top of the menu/cart so diners always know which mode they're in.
- **Host vs joiner.** First diner to start a group becomes the **host** (cosmetic only — gets a small badge, can rename the session e.g. "Sarah's birthday"). Anyone can fire.
- **Empty group safety.** If a host starts a group and nobody else joins within 5 min and they place an order, we silently downgrade to solo at checkout — no point bundling a party of one.

## Schema add-on (small delta to previous plan)

`table_sessions` already exists from the prior plan. Add:
- `host_diner_id uuid` — first joiner, may be null for anonymous guests
- `display_name text` — optional, set by host ("Sarah's birthday")
- `is_discoverable boolean default true` — hosts can mark a group "private" so new scanners don't see "join" prompt

`orders.session_mode text` — `'solo' | 'group'` — denormalised for analytics + audit even though it's derivable from `session_id IS NULL`.

New RPC `list_open_sessions_at_table(venue_id, table_id)` → returns open, discoverable sessions with diner count + host display name, for the landing chooser.

## UI changes

- **`src/components/consumer/SessionModeChooser.tsx`** (new) — the three-option chooser screen. Shows live "2 people ordering together" badges by polling/subscribing to `table_sessions` realtime.
- **`src/components/consumer/VenueLanding.tsx`** — render `SessionModeChooser` *after* hero, *before* the existing guest/signup/signin actions. Pass selection up via new `onModeSelect(mode, sessionId?)` callback.
- **`src/pages/ConsumerOrder.tsx`** — new state `sessionMode: 'solo' | 'group' | null` and `joinedSessionId`. Persist to `localStorage` key `ordrup:session:{venueId}:{tableId}`. Pass to `CheckoutPanel`.
- **`src/components/consumer/CheckoutPanel.tsx`** — when `sessionMode === 'group'`, call `find_or_create_table_session` RPC, stamp `session_id` + `session_mode='group'` on order, change CTA to "Send to table" and add the "holds for 90s" pill from previous plan.
- **`src/components/consumer/CartPanel.tsx`** — show mode pill at top: "Solo order" or "Group order with 3 others — Sarah's birthday".
- **`src/components/consumer/ModeSwitchSheet.tsx`** (new) — small bottom sheet to switch mode pre-first-order, opens from the pill.
- **`src/components/consumer/MenuFeed.tsx`** — pass mode through; group mode adds a thin colored top stripe so the diner can tell at a glance.

## Operator side (unchanged from prior plan)

Operator UI (`Orders.tsx` grouping, `SessionFireBar`, settings tab, knowledge base) is identical to the prior plan — it just receives a cleaner data model where `session_id IS NOT NULL` always means "diner explicitly chose group."

## Edge cases handled

- **Refresh / reopen QR:** localStorage restores mode + sessionId. If session was closed in the meantime, fall back to chooser.
- **Diner accidentally joins wrong table's group:** the `list_open_sessions_at_table` RPC is scoped to `(venue_id, table_id)` so cross-table joins are impossible.
- **Solo orderer at a table with active group:** they still see the group's open ticket on the operator view, but their order is unbundled — kitchen sees two cards: "Table 12 (group, 3 diners)" + "Table 12 (solo)" so expo can sequence delivery.
- **Diner abandons after starting group:** `idle_close_minutes` (from prior plan) auto-closes the session; no orphan tickets.

## Files to add or change

- `supabase/migrations/<ts>_session_mode_and_host.sql` — add columns + new RPC `list_open_sessions_at_table`
- `src/components/consumer/SessionModeChooser.tsx` — new
- `src/components/consumer/ModeSwitchSheet.tsx` — new
- `src/components/consumer/VenueLanding.tsx` — inject chooser
- `src/components/consumer/CartPanel.tsx` — mode pill
- `src/components/consumer/MenuFeed.tsx` — top stripe in group mode
- `src/components/consumer/CheckoutPanel.tsx` — branch on mode at order create
- `src/pages/ConsumerOrder.tsx` — mode state + persistence + threading
- `src/pages/KnowledgeBase.tsx` — extend the Table Sessions doc with the solo/group choice + host concept

## Order of implementation

1. Schema delta (`session_mode`, `host_diner_id`, `display_name`, `is_discoverable`, `list_open_sessions_at_table` RPC) — together with the prior Table Sessions migration as one combined migration.
2. `SessionModeChooser` + landing wiring (works in solo mode immediately, group mode falls through to existing single-order behaviour until the prior plan's session backend is in).
3. Plug `session_id` stamping into `CheckoutPanel` once the prior plan's RPC + cron are deployed.
4. Operator-side grouping + settings + KB last.

## Expected result

- Quick-coffee diner: scans → sees "Order on my own" highlighted → taps → menu → checks out → ticket fires immediately. Indistinguishable from today.
- Birthday party: Sarah scans first → "Start a group order" → names it "Sarah's birthday" → menu. Friends scan after → see "Join Sarah's birthday (1 person)" → tap → all five order independently → tickets bundle → kitchen fires once → all mains land together.
- Mixed table: 3 friends in a group + 1 stranger ordering solo at the same table → kitchen sees one bundled ticket for the trio + one solo card for the stranger.

