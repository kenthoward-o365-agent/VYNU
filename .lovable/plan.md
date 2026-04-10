

# Knowledge Base — Self-Service Help Centre

## Overview
Add a Knowledge Base accessible via a HelpCircle icon in the top-right header bar. Clicking it opens a full-page `/knowledge-base` route with comprehensive documentation structured to mirror the left-hand navigation, enabling venue operators to self-onboard.

## What gets built

### 1. Header icon (DashboardLayout.tsx)
Add a `HelpCircle` (lucide) icon button in the top-right of the header bar, next to the page title. Links to `/knowledge-base`.

### 2. New page: `KnowledgeBase.tsx`
A documentation page with a left-side table of contents and right-side content area. Sections map directly to the sidebar nav:

**A. Getting Started**
- Welcome / platform overview
- First-time setup checklist (venue details, menu, tables, go live)

**B. Dashboard**
- Understanding your metrics (revenue, orders, ticket times)
- Revenue by hour, table utilisation, top items

**C. Sippa AI Analytics**
- What the AI tracks and why
- Reading AI-driven insights

**D. Menu Builder**
- Creating categories and items
- Adding descriptions, prices, images
- **AI Features**: Import (uploading a PDF/photo menu), Enhance Images, Generate Missing Images
- **Modifiers**: Creating and assigning modifier groups

**E. Pricing**
- Setting up pricing tiers
- Time-based and day-based pricing rules

**F. Tables & QR**
- Creating table zones and tables
- Generating and printing QR codes
- How QR scanning works for diners

**G. Orders**
- Viewing and managing live orders
- Order statuses and lifecycle

**H. Analytics**
- Revenue trends, item performance
- Date range filtering

**I. Diners**
- Diner list and loyalty tracking
- **Diner Preferences**: Personalisation settings (welcome messages, predictive dining, order again, gamification)

**J. Settings**
- **Details**: Venue name, type, branding, operating hours
- **Users**: Inviting and managing staff accounts
- **Loyalty**: Configuring loyalty tiers and rewards
- **Sippa AI**: Agent name, personality, icon
- **Payments**: Payment gateway setup
- **Taxes**: Tax configuration
- **Landing Page Editor**: Customising the public venue page

Each section includes a brief explanation, step-by-step instructions, and tips. Content is static (hardcoded) — no database needed.

### 3. Route
Add `/knowledge-base` to `App.tsx` inside the authenticated DashboardLayout routes.

## Files to create/edit
- **Create** `src/pages/KnowledgeBase.tsx` — full documentation page with TOC sidebar and content sections
- **Edit** `src/components/DashboardLayout.tsx` — add HelpCircle icon button in header linking to `/knowledge-base`
- **Edit** `src/App.tsx` — add `/knowledge-base` route

## Technical notes
- No database tables or migrations needed — all content is static
- Uses existing Card, Separator, and scroll components
- Table of contents uses anchor links (`#section-id`) with smooth scrolling
- Responsive: TOC collapses to a dropdown on mobile
- Page title in header shows "Knowledge Base" when on that route

