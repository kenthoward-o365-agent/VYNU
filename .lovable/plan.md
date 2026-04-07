
## Tax Configuration System

### Database: New `venue_taxes` table
| Field | Type | Description |
|-------|------|-------------|
| venue_id | uuid | FK to venues |
| name | text | e.g. "GST", "VAT", "State Sales Tax", "PST" |
| rate | numeric | The rate value (e.g. 10 for 10%, or 1.50 for fixed) |
| tax_type | enum | `percent`, `fixed`, `compound_percent` (tax-on-tax) |
| is_inclusive | boolean | true = built into price (AU GST, UK VAT), false = added on top (US sales tax) |
| display_order | integer | Order taxes are applied (matters for compound) |
| is_active | boolean | Enable/disable without deleting |

- RLS: venue managers can CRUD, staff can view, public can view active taxes (needed for checkout display)
- A venue can have multiple active taxes (e.g. Canada: GST 5% + PST 7%)

### UI: Tax Settings Tab in Venue Settings
- New "Taxes" tab in the venue settings page
- Preset templates for quick setup:
  - 🇦🇺 **Australia**: GST 10% inclusive
  - 🇬🇧 **UK**: VAT 20% inclusive
  - 🇪🇺 **EU**: VAT (configurable rate) inclusive
  - 🇨🇦 **Canada**: GST 5% exclusive + PST (varies) exclusive
  - 🇺🇸 **US**: Sales Tax (varies) exclusive
- Ability to add custom taxes, edit rates, toggle active/inactive
- Clear explanation of inclusive vs exclusive and compound

### Code Changes
- **Menu Builder**: Replace hardcoded GST calculation with dynamic tax display based on venue config
- **Checkout**: Calculate tax totals dynamically from venue_taxes, showing each line item
- **New helper**: `calculateTaxes(subtotal, taxes[])` utility function for consistent calculation everywhere

### Tax Calculation Logic
1. **Inclusive %**: Tax = price × rate / (100 + rate) — price stays the same, tax is extracted
2. **Exclusive %**: Tax = subtotal × rate / 100 — added on top of price
3. **Fixed**: Tax = fixed amount per order
4. **Compound %**: Tax = (subtotal + previous taxes) × rate / 100 — applied after other taxes
