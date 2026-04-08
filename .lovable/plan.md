

## Plan: Email paid receipts to diners

### Summary
When an order is moved to "paid" status, automatically email the receipt to the diner (if they have an email on file). This requires setting up Lovable's email infrastructure, creating a receipt email template, and triggering the send when payment is confirmed.

### Prerequisites
1. **Set up email domain** — The project has no email infrastructure yet. We need to configure an email domain via the setup dialog, then run email infrastructure setup, then scaffold transactional email support.

### Steps

**1. Email infrastructure setup**
- Check email domain status; if none configured, present the domain setup dialog
- Run `setup_email_infra` to create queues, tables, cron jobs
- Run `scaffold_transactional_email` to create the send Edge Function and unsubscribe handling

**2. Create receipt email template**
- Create `supabase/functions/_shared/transactional-email-templates/order-receipt.tsx`
- React Email component matching the existing `ReceiptView` layout: venue name, order date, table number, ABN, itemized order, tax breakdown, total paid, venue contact info
- Register in `registry.ts`
- Deploy edge functions

**3. Create unsubscribe page**
- Add a route in the app for the unsubscribe path (determined by scaffold tool)
- Branded page that validates token and processes unsubscribe

**4. Trigger email on order status change to "paid"**
- In `src/pages/Orders.tsx`, when staff moves an order to "paid" status, invoke `send-transactional-email` with:
  - `templateName: 'order-receipt'`
  - `recipientEmail` from the diner's profile or order customer info
  - `templateData` with order items, venue info, taxes, total
  - `idempotencyKey: 'receipt-{orderId}'`
- Also trigger from `CheckoutPanel.tsx` if payment happens on the consumer side
- Gracefully skip if no diner email is available

### Technical details
- The receipt template will use inline styles matching the app's purple primary brand
- Tax calculation will be done before sending (pass pre-computed values as template data)
- The Edge Function fetches nothing from the DB — all data is passed in `templateData`
- Uses the existing `diner_profiles` email field and `order_items` join data already available at the trigger points

