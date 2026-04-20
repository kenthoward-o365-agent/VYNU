

## Goal

Restructure the diner ordering experience to match (and beat) Me&U's flow:

1. **Menu Feed** becomes a clean visual browse — bigger images, no inline quantity/add buttons.
2. Tapping an item opens a dedicated **Item Detail** screen with quantity, modifiers (add-ons / takeaways with venue-set min/max limits), AI upsell suggestions, and a single "Add to Order" CTA.
3. After adding, return to the menu feed.
4. **Kitchen/expo display** shows ALL chosen modifiers (including free ones like "no onion").
5. **Diner receipt** shows ONLY modifiers with a positive dollar value.

## Updated diner workflow

```text
Menu Feed (browse)
   ↓ tap card
Item Detail screen (full-screen on mobile, sheet on desktop)
   ┌──────────────────────────────────────┐
   │  [hero image · larger]               │
   │  Name · Description · Tags           │
   │  Base price                          │
   │                                      │
   │  Quantity:  [-] 1 [+]                │
   │                                      │
   │  ── Add-ons (max 3) ──               │
   │   ☑ Bacon  +$3.00                    │
   │   ☐ Avocado  +$2.50                  │
   │   ☐ Extra cheese  +$1.50             │
   │                                      │
   │  ── No / Hold (max 5) ──             │
   │   ☐ No onion                         │
   │   ☐ No pickles                       │
   │   ☐ Sauce on the side                │
   │                                      │
   │  ── You might also like ──           │
   │   [upsell card] [upsell card]        │
   │                                      │
   │  Special requests: [textarea]        │
   └──────────────────────────────────────┘
   [ Add 1 to Order — $18.50 ]   ← sticky bottom

   ↓ tap Add
Back to Menu Feed (toast: "Added Burger")
```

## Schema delta (one migration)

`modifier_categories` — add columns:
- `min_selection int default 0` — required minimum picks (0 = optional)
- `max_selection int default 0` — 0 means unlimited; >0 caps choices
- `selection_type text default 'addon'` — `'addon'` (extras with $) | `'removal'` (no/hold) | `'choice'` (size, etc.) — controls UI grouping and receipt-vs-ticket display logic
- `show_on_receipt_when_free boolean default false` — global override; default keeps free mods off receipts but on kitchen tickets

The existing `order_items.modifiers JSONB` and `order_items.notes` columns already cover persistence — no new tables needed. Modifier payload shape:

```json
[
  { "modifier_id": "uuid", "category_id": "uuid", "name": "Bacon", "price": 3.00, "type": "addon" },
  { "modifier_id": "uuid", "category_id": "uuid", "name": "No onion", "price": 0, "type": "removal" }
]
```

## UI changes

### New component
- **`src/components/consumer/ItemDetailScreen.tsx`** (new) — full-screen item view. Loads `menu_item_modifiers` + `modifier_categories` + `modifiers` for the item, groups by category, enforces `min_selection`/`max_selection`, runs the `upsell-suggest` edge function in `contextual_pairing` mode, exposes a sticky "Add N to Order — $X.XX" CTA, calls back with `{ id, name, basePrice, quantity, modifiers[], notes }`.

### Edited
- **`src/components/consumer/MenuFeed.tsx`** — strip the inline quantity selector + per-row Add/Plus buttons. Cards become tap targets that call `onItemSelect(item)`. Bump image size (mobile: square 96px → 128px row, or tile/grid layout on tap-friendly cards). Remove the bulk "Add N items" floating button (no longer needed since each item now flows through the detail screen).
- **`src/pages/ConsumerOrder.tsx`** — new state `selectedItem: MenuItem | null`. When set, render `ItemDetailScreen` over the feed. Replace `onAddToCart(item)` with `onItemSelect(item)`; the actual add is triggered from the detail screen and now accepts the full payload `(item, quantity, modifiers, notes)`. `addToCart` becomes mod-aware: each unique combination of `{menu_item_id + modifier signature + notes}` is a separate cart line so the kitchen sees them correctly.
- **`src/components/consumer/CartPanel.tsx`** — render each line's chosen modifiers underneath the item name (compact: "+ Bacon · No onion"). Quantity controls remain (lets diner bump quantity of an already-configured line). Editing modifiers requires removing + re-adding (keeps logic simple).
- **`src/components/consumer/CheckoutPanel.tsx`** — when inserting `order_items`, write the per-line `modifiers` JSONB (include name + price + type so the kitchen ticket is self-contained even if a modifier is later renamed) and the `notes` field. `unit_price` stays as base price; modifier costs are added per-line at receipt/total calc time.

### Cart total calc
Update both `CartPanel` total and `CheckoutPanel` `total` calc to:
```
line_total = (basePrice + sum(modifier.price)) * quantity
```

### Receipt vs kitchen ticket display logic
- **Kitchen / expo display** (`Orders.tsx`, `OrderCard`, display terminals) — show every modifier in `order_items.modifiers[]` plus `notes`. Visual style: addons shown as green "+ Bacon", removals as red "✕ No onion".
- **Diner receipt** (`ReceiptView.tsx`) — fetch `modifiers` JSONB. Render only those with `price > 0` (so "+ Bacon $3.00" appears, "No onion" doesn't). Same rule for the post-payment receipt PDF.

### Operator side
- **`src/pages/Modifiers.tsx`** — extend the category create/edit row with two number inputs ("Min", "Max — 0 = unlimited") and a small `selection_type` selector (Add-on / No or Hold / Choice). AI Generate flow keeps working — auto-set `selection_type='addon'` for paid mods and `'removal'` for $0 mods unless the user edits.
- **`src/pages/Orders.tsx`** / order card components — wire the modifier display (the data is already in `order_items.modifiers`, just hadn't been rendered).
- **`src/pages/KnowledgeBase.tsx`** — new subsection "Item Detail Flow & Modifier Limits": explain the diner flow change, min/max enforcement, the receipt-vs-ticket rule, and migration notes for venues that already have modifiers (defaults are safe — nothing breaks).

## Files to add or change

- `supabase/migrations/<ts>_modifier_limits_and_types.sql` — add columns
- `src/components/consumer/ItemDetailScreen.tsx` — new
- `src/components/consumer/MenuFeed.tsx` — strip controls, bigger imagery, tap-to-open
- `src/components/consumer/CartPanel.tsx` — render modifiers per line
- `src/components/consumer/CheckoutPanel.tsx` — persist modifiers + notes, modifier-aware total
- `src/components/consumer/ReceiptView.tsx` — render only paid modifiers
- `src/pages/ConsumerOrder.tsx` — selectedItem state + new addToCart signature
- `src/pages/Modifiers.tsx` — min/max + selection_type editors
- `src/pages/Orders.tsx` (and any operator order card) — render full modifier list on kitchen view
- `src/pages/KnowledgeBase.tsx` — new docs section

## Edge cases handled

- **Item with no modifiers** — detail screen still opens (gives visual + larger image + quantity), single tap on "Add to Order" returns to feed. Optional optimisation later: skip the screen if no modifiers AND no upsells available, but default behaviour is consistent.
- **Required modifiers (min_selection ≥ 1)** — Add to Order button is disabled with an inline hint ("Pick at least 1 size") until satisfied.
- **Cart line de-duplication** — two adds of "Burger + Bacon + No onion" merge into qty 2; "Burger + Bacon" and "Burger + Avocado" stay as separate lines.
- **Existing cart at the moment of switching** — no migration needed; existing cart entries simply have empty `modifiers` arrays.
- **Free modifier names changing later** — we snapshot name + price into `order_items.modifiers` at insert time, so receipts and tickets are immutable.

## Order of implementation

1. Migration (modifier columns).
2. `Modifiers.tsx` admin UI updates so venues can configure limits.
3. `ItemDetailScreen` + `ConsumerOrder` rewiring + `MenuFeed` simplification.
4. `CartPanel` modifier rendering + `CheckoutPanel` persistence.
5. Operator `Orders.tsx` modifier rendering + `ReceiptView.tsx` paid-only filter.
6. Knowledge base section.

## Expected result

- Diner taps a burger → hero image fills the screen → picks "Bacon (+$3)" + "No onion" + qty 2 → "Add 2 to Order — $43.00" → back to feed.
- Kitchen ticket shows: `2× Burger · + Bacon · ✕ No onion`.
- Diner receipt shows: `2× Burger $20.00 ea — + Bacon $3.00 ea`. "No onion" is silently omitted (it has no price).
- Venue manager sets "Add-ons" category to max 3, "No / Hold" to max 5 — diners can't exceed those caps in the UI.

