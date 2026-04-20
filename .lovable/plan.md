

## Goal

Extend the Display Terminals plan to also include a **detailed Knowledge Base update** so venue managers, IT installers, and support staff have step-by-step setup instructions, troubleshooting guidance, and a clear mental model of how terminal pairing works. This is the most operationally complex feature in the product, so the KB section needs to be thorough.

## What gets added to `src/pages/KnowledgeBase.tsx`

A new top-level section **"Display Terminals"** under the Order Display System article, with these subsections:

### 1. Concept overview
- What a Display Terminal is (a physical device — Mac mini, iPad, TV with a stick PC — running OrdrUp in a browser at a fixed station)
- Difference between **a user** (who logs in), **a Display Area** (logical routing — Kitchen, Bar), and **a Display Terminal** (a specific browser on a specific device)
- Why a user can be signed in on multiple devices but each device can be bound to only one terminal identity
- Diagram (ASCII) showing: Order → Display Area routing → Terminals subscribed to that area

### 2. Why we don't use MAC address (FAQ)
- Browsers can't read MAC addresses (privacy sandbox)
- Even native apps get a randomised per-app ID on modern OSes
- Our solution: a **device token** (UUID) the cloud issues during pairing, stored in `localStorage`
- Implications: clearing browser data un-pairs the terminal; incognito mode won't persist the binding; each browser profile = one potential terminal

### 3. First-time setup (step-by-step)
Numbered steps for the manager, with screenshots placeholders:
1. Create your Display Areas (Kitchen, Bar, Expo, etc.) in the Display Areas section
2. Assign Display Areas to your menu categories and items (covers the existing routing feature)
3. Go to **Order Display System → Display Terminals** → click **Add Terminal**
4. Name it descriptively ("Kitchen Mac mini — line cook station")
5. Pick the Display Areas this terminal should show
6. Save → copy the **6-character pairing code** (e.g. `K7-9F2`) — valid for 10 minutes

### 4. Pairing the physical device
1. On the kitchen Mac mini, open Chrome/Safari/Edge → go to your OrdrUp URL
2. Sign in with any staff account that has Orders access
3. In the Orders page header click **"Pair this Terminal"**
4. Enter the 6-character code → tap Pair
5. Page reloads → header now shows `🖥 Kitchen Mac mini — Fry Side, Expo` and only relevant orders appear

### 5. Day-to-day operation
- Heartbeat: terminal pings the cloud every 60s while Orders is open → status shows **Online** in the dashboard
- If the terminal page is closed/asleep, status flips to **Offline** after ~2 minutes (other terminals continue working)
- Signing out the user does NOT un-pair the device — the next user who signs in gets the same station view
- "Show all (override)" toggle lets a manager temporarily see the full order list without un-pairing

### 6. Managing terminals (manager actions)
- **Rename** a terminal at any time
- **Change assigned Display Areas** — takes effect on next page load on that terminal
- **Regenerate pairing code** — issues a new 10-min code (use if the previous one expired before pairing)
- **Unpair / revoke** — invalidates the device token immediately. Use cases: lost iPad, swapping hardware, decommissioning a station. The browser will fall back to the unpaired Orders view on next reload
- **Deactivate** — keeps the configuration but stops it appearing in routing; useful for a terminal that's temporarily out of service

### 7. Multi-terminal patterns
Worked examples showing common venue setups:
- **Small café**: 1 terminal showing all areas (functionally identical to no terminal binding, but gives you "Online" monitoring)
- **Pub with separate kitchen + bar**: Kitchen terminal → Kitchen area; Bar terminal → Bar area
- **Restaurant with brigade**: Fry Side terminal → Fry; Grill terminal → Grill; Expo terminal → all three (Fry + Grill + Cold) so the expediter sees everything coming together
- **Front of house tablet**: Tablet bound to all areas with "Show all" override on by default — server uses it to chase orders across the floor

### 8. Troubleshooting
Table of symptom → cause → fix:
- "I entered the code but it says invalid" → expired (>10 min) or already used → regenerate from the dashboard
- "Terminal shows Offline but the screen is on" → browser tab is in background or device asleep → bring tab to foreground; disable display sleep on the device
- "Wrong orders appearing" → terminal is bound to the wrong Display Areas → edit terminal, fix areas, reload the device's browser
- "Terminal lost its identity after a Chrome update" → localStorage cleared → re-pair with a fresh code
- "Same device keeps showing as two terminals" → user used both Chrome and Safari on the same Mac → each browser is its own terminal; pick one and standardise
- "Pairing code dialog won't open" → user lacks Orders access in their role → grant `orders` nav permission

### 9. Security notes
- Device tokens are venue-scoped — a token from Venue A cannot view Venue B's orders even if pasted in
- Tokens never appear in URLs or logs
- Unpair immediately if a device is lost or stolen
- Heartbeat lets you spot a terminal that's been unplugged for hours — alert (future enhancement) will email when a critical station goes offline

### 10. Hardware recommendations (brief)
- **Kitchen**: Mac mini + 27" wall-mounted monitor in landscape, or an iPad Pro 12.9" in a kitchen-grade case
- **Bar**: iPad 10.9" in a counter mount
- **Expo**: large TV (43"+) with an Intel NUC or Mac mini, browser in fullscreen kiosk mode
- For all: disable display sleep, enable auto-launch of the browser to your OrdrUp URL after reboot

## Implementation note

This KB content will be added in the same PR as the Display Terminals feature itself (the previously approved plan). When you say "go", I implement both:
1. The Display Terminals feature (schema, RPCs, manager UI, pairing dialog, terminal-aware Orders page)
2. The Knowledge Base section above

## Files touched

- `src/pages/KnowledgeBase.tsx` — add the "Display Terminals" section described
- Plus all files from the previously approved Display Terminals plan

## Out of scope

- Actual screenshots (placeholders only — to be added once UI is built)
- Native kiosk-mode wrapper docs
- Email alerts for offline terminals

