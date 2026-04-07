

# Tab-Less — Venue Operator Dashboard (Phase 1)

## Overview
Build the venue operator dashboard — the foundation that powers everything. Venues need to set up their menus, tables, and settings before consumers can order. This phase creates the operator experience with AI-powered menu management and real-time analytics.

## What We're Building

### 1. Authentication & Venue Onboarding
- Venue owner/manager sign-up and login
- Venue profile setup (name, type, location, operating hours, branding)
- QR code generation for each table/zone

### 2. AI-Powered Menu Builder
- Conversational menu creation — "Add a wagyu burger, $28, takes 12 mins, contains gluten and dairy"
- Menu items with: name, description, price, prep time, allergens, dietary tags, photo, category
- AI-generated descriptions and upsell suggestions
- Menu categories and item ordering
- Item availability toggling (86'd items)

### 3. Dynamic Pricing Engine
- Base prices with time-of-day modifiers (happy hour, late night)
- AI suggestions on pricing based on food cost percentages
- Special/promo pricing with date ranges

### 4. Dashboard & Analytics
- **Live view**: Active tables, open orders, real-time revenue ticker
- **Historical reporting**: Daily/weekly/monthly revenue, average check size, popular items
- **Product mix analysis**: Best sellers, underperformers, margin leaders
- **AI insights panel**: Suggestions for menu changes, loss leaders, pricing optimizations

### 5. Table & QR Management
- Define tables/zones with capacity
- Generate unique QR codes per table
- QR codes link to consumer ordering experience (built in Phase 2)

### 6. Order Management
- Live order feed with status tracking (received → preparing → ready → served)
- Order history and search
- Basic kitchen display view

## Database Schema (Key Tables)
- `venues` — venue profiles and settings
- `venue_staff` — staff accounts with roles (owner, manager, staff)
- `menu_items` — items with pricing, allergens, prep time
- `menu_categories` — item grouping
- `tables` — table/zone definitions with QR codes
- `orders` / `order_items` — order tracking
- `pricing_rules` — dynamic pricing conditions
- `analytics_events` — event tracking for dashboards

## Design Direction
- Clean, professional operator UI — dark sidebar navigation
- Mobile-responsive but optimized for tablet/desktop (operators use iPads and laptops)
- Real-time updates using Supabase realtime subscriptions
- AI interactions via Lovable AI gateway

## Phase 2 Preview (Next)
Consumer mobile ordering experience — QR scan → AI chat + TikTok-style visual feed → pay-per-order flow.

