

# Rename "Phewdie" → "Phewdee" + Replace All Remaining "Sippa" References

## Overview
Two tasks combined: (1) correct the spelling from "Phewdie" to "Phewdee" everywhere it appears, and (2) replace all remaining "Sippa" references across the entire codebase — including the Knowledge Base, Auth page, Admin Staff page, Consumer Order page, AI Settings component, App.tsx, and Tables page.

## Files to edit

### 1. "Phewdie" → "Phewdee" (6 files)
- **`index.html`** — title, author, og/twitter tags
- **`src/assets/noshi-lockup.svg`** — brand text
- **`src/assets/noshi-lockup-dark.svg`** — brand text
- **`src/components/DashboardLayout.tsx`** — nav labels, alt text, header fallback
- **`src/pages/SippaAnalytics.tsx`** — page heading
- **`.lovable/memory/index.md`** — project memory

### 2. "Sippa" → "Phewdee" (8 files, ~49 occurrences in Knowledge Base alone)
- **`src/pages/KnowledgeBase.tsx`** — TOC label, all section titles, body text, support email → `support@phewdee.com` (or placeholder)
- **`src/pages/Auth.tsx`** — login/signup headings and descriptions
- **`src/pages/AdminStaff.tsx`** — "Sippa admin" badges and descriptions
- **`src/pages/ConsumerOrder.tsx`** — default agent name fallback
- **`src/pages/Tables.tsx`** — published base URL comment (cosmetic)
- **`src/components/venue/SippaAISettings.tsx`** — placeholder text, toast messages, loading text, button label, storage path comment
- **`src/components/venue/SippaAnalytics.tsx`** — heading text
- **`src/App.tsx`** — loading screen text

### 3. No structural or database changes
Pure text replacement — no routing, schema, or component renames needed.

