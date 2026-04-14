

# Rebrand "Phewdee" → "Ordrup" (+ clean up all legacy Sippa/Noshi references)

## Scope
Replace every occurrence of "Phewdee", "Sippa", and "Noshi" (in user-visible text, comments, imports, filenames, and assets) with "Ordrup". Pure text/asset replacement — no database, routing, or structural changes.

## Files to edit

### HTML & Assets (4 files)
- **`index.html`** — title, author, description, og/twitter tags: "Phewdee" → "Ordrup"
- **`src/assets/noshi-lockup.svg`** — text element → "Ordrup", adjust underline width (~48px for 6 chars)
- **`src/assets/noshi-lockup-dark.svg`** — same as above
- **`public/noshi-icon.svg`** — no text change needed (just the geometric icon), but favicon `<link>` in index.html still references it

### Core App (2 files)
- **`src/App.tsx`** — loading screen text, import path for SippaAnalyticsPage
- **`src/components/DashboardLayout.tsx`** — alt text, nav labels ("Phewdee AI" → "Ordrup AI"), header fallback

### Pages (9 files)
- **`src/pages/Auth.tsx`** — heading, description ("Set up your venue on Ordrup")
- **`src/pages/Onboarding.tsx`** — card description
- **`src/pages/AdminStaff.tsx`** — badge text, description
- **`src/pages/KnowledgeBase.tsx`** — all section titles, body text, support email → `support@ordrup.com`
- **`src/pages/SippaAnalytics.tsx`** — heading text
- **`src/pages/Tables.tsx`** — published base URL comment
- **`src/pages/DinerPreferences.tsx`** — any remaining references
- **`src/pages/VenueSettings.tsx`** — import reference (SippaAISettings)
- **`src/pages/ConsumerOrder.tsx`** — fallback agent name

### Components (4 files)
- **`src/components/venue/SippaAISettings.tsx`** — default agent name, placeholder text, toast messages, storage path comment
- **`src/components/venue/SippaAnalytics.tsx`** — heading text
- **`src/components/consumer/VenueLanding.tsx`** — "Powered by Ordrup"
- **`src/components/consumer/ReceiptView.tsx`** — "Powered by Ordrup Pty Ltd"
- **`src/components/consumer/AIChatOverlay.tsx`** — default agent name

### Edge Functions (2 files)
- **`supabase/functions/diner-chat/index.ts`** — fallback agent name
- **`supabase/functions/admin-create-user/index.ts`** — error message text

### Legacy asset cleanup
- **`src/assets/sippa-lockup.svg`** — still contains old Sippa branding; delete or update
- **`src/assets/sippa-lockup-dark.svg`** — same

### Memory (1 file)
- **`.lovable/memory/index.md`** — update project name to Ordrup

## Technical details
- SVG text elements: update the `<text>` content and adjust the `<rect>` underline width to match "Ordrup" (~48px)
- Default agent name in AI settings and edge functions changes from "Phewdee" to "Ordrup"
- Support email becomes `support@ordrup.com` (placeholder)
- No route path changes (routes like `/sippa-analytics` stay as-is to avoid breaking bookmarks; only labels change)

