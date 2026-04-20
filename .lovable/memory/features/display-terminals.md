---
name: Display Terminals
description: Physical device pairing system — bind a browser/station to specific Display Areas via 6-char pairing code + UUID device token in localStorage
type: feature
---

Physical kitchen/bar/expo screens are registered as `display_terminals` rows and bound to one or more `venue_display_areas` via `display_terminal_areas`.

**Why not MAC address**: browsers can't read it (privacy sandbox). Even native apps get a randomised per-app ID. Solution: cloud issues a UUID `device_token` on pairing, stored in `localStorage.ordrup_terminal_token`.

**Pairing flow**:
1. Manager creates terminal in Order Display System → gets 6-char code (10-min expiry)
2. On the physical device, signed-in staff opens Orders → "Pair this Terminal" → enters code
3. RPC `pair_display_terminal(_code, _user_agent)` validates, generates token, returns `{ terminal_id, device_token, area_ids }`
4. Browser stores token, reloads — Orders page now filters to the terminal's area items

**Key RPCs** (all SECURITY DEFINER, search_path=public):
- `pair_display_terminal(code, user_agent)` — exchange code for token (requires authed venue staff)
- `heartbeat_display_terminal(token)` — pinged every 60s while Orders is open; updates `last_seen_at`
- `get_terminal_by_token(token)` — Orders page reads this to know which areas to filter to
- `unpair_display_terminal(terminal_id)` — manager revokes token (clears `device_token`)

**Filtering**: Orders.tsx joins through `menu_item_display_areas` + `menu_category_display_areas` to build a Set of allowed `menu_item_id`s, then filters orders client-side. "Show all (override)" toggle lets a manager bypass without unpairing.

**Online status**: `last_seen_at < 2 min ago` = Online (green dot). Otherwise Offline.

**Security**: Tokens are venue-scoped (RPCs check via the terminal row). RLS on `display_terminals`: staff SELECT, manager INSERT/UPDATE/DELETE. Same for `display_terminal_areas` via parent terminal.

**Known limitation**: Clearing browser data un-pairs (token in localStorage). Incognito mode doesn't persist. Each browser profile = one potential terminal.
