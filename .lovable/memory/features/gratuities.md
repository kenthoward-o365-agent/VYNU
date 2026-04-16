---
name: Gratuities
description: Tips are a structured numeric column on orders, excluded from taxable revenue, reported by audit_date
type: feature
---
- `orders.gratuity_amount` (numeric, default 0) holds the tip
- `orders.audit_date` (date) is stamped at insert from `get_venue_audit_date(_venue_id)` RPC so reports tie to the venue's business day
- `orders.total` still equals subtotal + tip (payment flow unchanged)
- Dashboard formula: `taxableTotal = sum(total) - sum(gratuity)`, then `calculateTaxes(taxableTotal, taxes)` — tips are NOT taxed and NOT counted in gross/net revenue
- Gratuities Report lives at DayEnd > Reports, filterable via AuditDatePicker, exports to CSV
- Public RPC `get_venue_audit_date` is granted to anon so consumer checkout can stamp audit_date without RLS access to `venue_audit_dates`
