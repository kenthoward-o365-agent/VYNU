

# AI Upsell Engine — Contextual Suggestions & Revenue Optimisation

## Overview
Build an AI-powered upsell system that surfaces helpful suggestions at four touchpoints in the consumer ordering flow: after adding an item, after tapping "Add to cart", when opening the cart, and as a reorder prompt for returning diners. All suggestions are non-intrusive, dismissible with one tap, and never repeat for the same item in a session.

## What gets built

### 1. Upsell edge function (`supabase/functions/upsell-suggest/index.ts`)
A backend function that receives a venue ID + trigger context and returns suggestions using Lovable AI:
- **Contextual pairing**: Given the item just added, analyse the venue's menu to suggest a complementary item (e.g. steak → red wine, coffee → pastry). Initially uses menu category logic and item descriptions; future iterations can incorporate order history data.
- **Add-on prompt**: After modifier selection, suggest an upgrade or side (e.g. "Add chips for $5?").
- **Cart suggestions**: Given the current cart contents, suggest 1–2 low-friction additions (sides, desserts, drinks).
- Uses `google/gemini-3-flash-preview` via Lovable AI gateway with tool calling to return structured JSON (item IDs, suggestion text).

### 2. Upsell prompt component (`src/components/consumer/UpsellPrompt.tsx`)
A reusable, animated slide-up card that displays a suggestion:
- Shows item image, name, price, and a one-line reason ("Goes great with your steak")
- "Add" button (single tap to add to cart) and "No thanks" dismiss button
- Auto-dismisses after 5 seconds if not interacted with
- Tracks shown suggestions in session state to prevent repeats

### 3. Cart suggestions component (`src/components/consumer/CartSuggestions.tsx`)
Displayed at the bottom of CartPanel when items are in the cart:
- Shows max 2 AI-suggested items with image, name, price
- Single-tap "+" button to add each
- Fetches suggestions when cart tab is opened

### 4. Session upsell tracker (in ConsumerOrder state)
- `shownUpsells: Set<string>` — tracks item IDs that have already triggered an upsell prompt
- `dismissedSuggestions: Set<string>` — tracks suggestion IDs the user dismissed
- Enforces: max 1 upsell per item addition, max 2 cart suggestions, no repeats per session

### 5. Integration points in ConsumerOrder.tsx
- **After addToCart**: Call upsell edge function with the added item, show UpsellPrompt overlay if a suggestion is returned and hasn't been shown
- **Cart tab**: Pass menu items to CartPanel; CartPanel calls edge function for cart-based suggestions
- **Reorder prompt**: Already partially built (lastOrderItems). Enhance with a configurable time window check and a dismissible "Another round?" prompt using the same UpsellPrompt component

### 6. Venue configuration (DinerPreferences.tsx)
Add an "AI Upsell" section to Diner Personalisation settings stored in `venues.settings.upsell`:
```text
{
  enabled: true,
  contextual_pairing: true,
  addon_prompts: true,
  cart_suggestions: true,
  reorder_prompts: true,
  reorder_window_minutes: 30
}
```

## Files to create/edit
- **Create** `supabase/functions/upsell-suggest/index.ts` — AI suggestion logic
- **Create** `src/components/consumer/UpsellPrompt.tsx` — dismissible suggestion overlay
- **Create** `src/components/consumer/CartSuggestions.tsx` — cart bottom suggestions
- **Edit** `src/pages/ConsumerOrder.tsx` — session tracking, upsell trigger after addToCart, reorder prompt
- **Edit** `src/components/consumer/CartPanel.tsx` — integrate CartSuggestions at bottom of item list
- **Edit** `src/pages/DinerPreferences.tsx` — add AI Upsell configuration section

## Technical notes
- No database migration needed — upsell config stored in existing `venues.settings` JSONB
- Edge function uses Lovable AI with structured output (tool calling) to return valid menu item IDs
- Menu items array is passed to the edge function so the AI only suggests items that actually exist on the menu
- Session-level tracking prevents suggestion fatigue — all enforced client-side
- UpsellPrompt uses CSS transitions for smooth slide-up/fade-out animation
- Cart suggestions lazy-load when the cart tab is activated (not on every cart change)

