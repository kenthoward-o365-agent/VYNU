# Phase 2: Consumer Mobile Diner Experience

## Overview
Build the mobile-first consumer ordering app that diners access via QR code scan at a venue table. No app download needed — it's a web app optimized for mobile. This is the core product differentiator vs me&u.

## Flow
1. **QR Scan** → Opens `/order/{venue_id}/{table_id}` in mobile browser
2. **Landing** → Venue branding, table info, option to sign in or continue as guest
3. **Ordering** → Hybrid AI chat + TikTok-style visual menu feed
4. **Cart & Checkout** → Review, pay per order (Stripe), or open a tab
5. **Order Tracking** → Real-time status updates via realtime subscriptions

## What We're Building

### 1. Public Routes (no auth required for browsing)
- `/order/:venueId/:tableId` — Main consumer entry point
- Separate from the operator dashboard (different layout, no sidebar)

### 2. Venue Landing Screen
- Venue logo, name, table number confirmation
- "Start Ordering" CTA
- Optional: sign in for loyalty/history, or continue as guest

### 3. TikTok-Style Menu Feed
- Full-screen swipeable cards showing menu items with images
- Category filters (horizontal scrollable chips)
- Quick "Add to order" button on each card
- Dietary/allergen tags visible
- AI-powered "Recommended for you" section

### 4. AI Chat Ordering
- Floating chat button → opens conversational AI overlay
- "I'm in the mood for something spicy" → AI suggests items
- "What did I have last time?" (if signed in)
- "Something light under $20" → filtered suggestions
- Uses Lovable AI Gateway (Gemini Flash)

### 5. Cart & Order Management
- Slide-up cart panel
- Item quantities, modifiers, notes
- Order total with any active pricing rules applied
- "Place Order" → creates order + order_items in DB
- Real-time order status tracking (received → preparing → ready → served)

### 6. Guest vs Signed-In Experience
- **Guest**: Can browse and order, no history
- **Signed in**: Loyalty points, order history, "the usual", allergen memory

## Technical Approach
- New `/order` route tree with its own mobile-optimized layout (no DashboardLayout)
- Public menu data already accessible via existing anon RLS policy on menu_items
- Orders already insertable by anon users via existing RLS
- AI chat via edge function calling Lovable AI Gateway
- Stripe integration for payments (future iteration — start with "pay at counter" flow)

## Implementation Order
1. Consumer layout + routing (`/order/:venueId/:tableId`)
2. Venue landing screen
3. Menu feed (TikTok-style card browsing)
4. Cart + place order flow
5. AI chat ordering overlay
6. Real-time order status tracking
7. Guest vs signed-in experience + diner profiles

## Design Direction
- Mobile-first (375px primary target)
- Dark/moody aesthetic matching venue vibes, or venue-branded colors
- Bottom navigation: Feed | Chat | Cart | Profile
- Smooth animations, haptic-feeling interactions
- Large touch targets, thumb-zone optimized
