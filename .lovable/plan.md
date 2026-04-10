

# Gratuities Settings — Venue Configuration + Checkout Prompt

## Overview
Add a "Gratuities" tab under Settings that lets venues enable tipping and configure three suggestion buttons (each with a custom label and percentage). When enabled, a gratuity prompt appears during checkout in the consumer web app, auto-calculating tip amounts based on the order total.

## What gets built

### 1. Settings sidebar link
Add a "Gratuities" entry to the Settings sub-nav in `DashboardLayout.tsx` (between Payments and Taxes), using a coin/hand icon.

### 2. Gratuities tab in VenueSettings
A new `TabsContent value="gratuities"` section with:
- **Master toggle**: Enable/disable gratuities
- **Three suggestion buttons**, each with:
  - Custom label (e.g. "Good", "Great", "Amazing")
  - Percentage value (e.g. 10%, 15%, 20%)
  - Live preview showing the label and a sample calculation
- **"No thanks" option** is always shown (not configurable — hardcoded in checkout)

Data stored in `venues.settings.gratuities` as JSON — no migration needed:
```text
{
  enabled: true,
  options: [
    { label: "Good", percent: 10 },
    { label: "Great", percent: 15 },
    { label: "Amazing", percent: 20 }
  ]
}
```

### 3. Gratuity prompt in CheckoutPanel
When the venue has gratuities enabled:
- After the order summary and before the payment section, show a "Add a tip?" card
- Display the three configured buttons showing the label + calculated dollar amount (e.g. "Great — $4.50")
- A "No thanks" button to skip
- Selected tip amount adds to the grand total
- Tip amount included in the payment and stored on the order

### 4. Store gratuity on the order
The `orders` table already has a `total` column. The tip will be added to the total before payment processing. No schema change needed for MVP — the tip is simply included in the total. A `customer_notes` field can note the tip if needed.

## Files to create/edit
- **Edit** `src/components/DashboardLayout.tsx` — add Gratuities sub-link under Settings
- **Edit** `src/pages/VenueSettings.tsx` — add Gratuities tab content
- **Edit** `src/components/consumer/CheckoutPanel.tsx` — add gratuity prompt UI + logic

## Technical notes
- Uses existing `venues.settings` JSONB column — no database migration
- CheckoutPanel fetches venue settings to check if gratuities are enabled and read the options
- Tip selection state managed locally in CheckoutPanel; added to total before order creation and payment
- Follows existing pattern of PaymentSettingsTab / TaxSettingsTab as inline tab content

