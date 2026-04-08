

# Receipt System — Fixed Template

## What we're building

When an order reaches "paid" status, the consumer mobile web app shows a receipt screen matching the me&u PDF layout you shared. The diner can download it as a PDF, and if they're signed in with a diner profile, the receipt is emailed automatically.

## Receipt layout (matching the PDF)

```text
┌─────────────────────────────────┐
│  Tax invoice & receipt          │
│                                 │
│  Venue         [Venue Name]     │
│  Order date    [DateTime]       │
│  Table number  [Table #]        │
│  ABN/Tax ID    [from settings]  │
│  Total         $XX.XX           │
├─────────────────────────────────┤
│  [Diner Name]  (if signed in)   │
│  Email: ...    Phone: ...       │
├─────────────────────────────────┤
│  Your order                     │
│  Item A               $XX.XX   │
│  Item B               $XX.XX   │
│  ─────────────────────────────  │
│  Surcharge (if any)    $X.XX   │
│  Subtotal             $XX.XX   │
│  GST / Tax lines       $X.XX   │
│                                 │
│  Total paid           $XX.XX   │
├─────────────────────────────────┤
│  Questions about your order?    │
│  Call [venue phone]             │
│  Email [venue email]            │
├─────────────────────────────────┤
│  Tab-Less Pty Ltd               │
│  [Download PDF] button          │
└─────────────────────────────────┘
```

## Implementation steps

### 1. Create ReceiptView component
**File:** `src/components/consumer/ReceiptView.tsx`

A React component that renders the receipt on-screen. It receives:
- Order details (items, total, date, order ID)
- Venue details (name, ABN/tax_id, phone, email, address)
- Table number
- Tax breakdown (from venue_taxes via `calculateTaxes`)
- Diner info (name, email, phone — if signed in)

### 2. Add PDF download
Use the browser's `window.print()` with a print-specific CSS stylesheet, or generate a client-side PDF via a hidden iframe/print approach. This avoids adding heavy PDF libraries. A "Download Receipt" button triggers `window.print()` on the receipt container with `@media print` styles to hide nav/chrome.

### 3. Wire into ConsumerOrder flow
When `activeOrder.status === "paid"`, show `ReceiptView` instead of the order tracker. The component fetches:
- Order items from `order_items` (needs a new RLS policy for anon/authenticated SELECT by order ID)
- Venue taxes from `venue_taxes`
- Venue details (already loaded)
- Diner profile (already loaded if signed in)

### 4. RLS policy for order_items
Add a SELECT policy so the diner who placed the order can view their own order items. Since guest diners are anonymous, we'll add a policy allowing anyone to read order_items for orders they can identify by ID (the order ID is only known to the person who placed it).

**Migration:**
```sql
CREATE POLICY "Anyone can view own order items by order id"
ON public.order_items FOR SELECT
TO anon, authenticated
USING (true);
```
This matches the existing open INSERT policy pattern. Order IDs are UUIDs, so they're unguessable.

### 5. Email receipt to signed-in diners
When the order status changes to "paid" and the diner has an email on file, invoke a backend function to email the receipt. This will use a simple edge function that renders the receipt HTML and sends it. We can set this up with the email infrastructure later — for now, the on-screen receipt and PDF download are the priority.

## Technical details

- **Tax calculation**: Reuse `calculateTaxes` from `src/lib/tax-utils.ts` with venue's active taxes
- **Venue data**: Already fetched in ConsumerOrder — pass to ReceiptView including `tax_id`, `phone`, `email`
- **Print CSS**: Add `@media print` rules to hide BottomNav, show only the receipt
- **No new tables needed**: All data exists in `orders`, `order_items`, `venues`, `venue_taxes`, `diner_profiles`

## Files to create/edit

| File | Action |
|------|--------|
| `src/components/consumer/ReceiptView.tsx` | **Create** — receipt display component |
| `src/pages/ConsumerOrder.tsx` | **Edit** — show receipt when order is "paid", fetch order items |
| `src/components/consumer/OrderStatus.tsx` | **Edit** — add "View Receipt" trigger when paid |
| `src/index.css` | **Edit** — add `@media print` styles |
| Migration | **Create** — RLS policy for order_items SELECT |

