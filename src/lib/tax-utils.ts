export interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  tax_type: "percent" | "fixed" | "compound_percent";
  is_inclusive: boolean;
  display_order: number;
}

export interface TaxLineItem {
  name: string;
  amount: number;
  rate: number;
  tax_type: string;
  is_inclusive: boolean;
}

/**
 * Calculate tax breakdown for a given subtotal and list of tax configs.
 * Returns individual tax line items and the final total.
 *
 * - Inclusive %: tax is already in the price → extracted as price × rate / (100 + rate)
 * - Exclusive %: added on top → subtotal × rate / 100
 * - Fixed: flat amount added on top
 * - Compound %: applied after other exclusive taxes → (subtotal + previous exclusive taxes) × rate / 100
 */
export function calculateTaxes(
  itemsTotal: number,
  taxes: TaxConfig[]
): { lines: TaxLineItem[]; subtotalExTax: number; totalTax: number; grandTotal: number } {
  const sorted = [...taxes].sort((a, b) => a.display_order - b.display_order);

  let inclusiveTaxTotal = 0;
  let exclusiveTaxTotal = 0;
  const lines: TaxLineItem[] = [];

  // First pass: inclusive taxes (extracted from the price)
  for (const tax of sorted) {
    if (!tax.is_inclusive) continue;
    let amount = 0;
    if (tax.tax_type === "percent" || tax.tax_type === "compound_percent") {
      // For inclusive: tax = total × rate / (100 + rate)
      amount = itemsTotal * tax.rate / (100 + tax.rate);
    } else if (tax.tax_type === "fixed") {
      amount = tax.rate;
    }
    amount = Math.round(amount * 100) / 100;
    inclusiveTaxTotal += amount;
    lines.push({ name: tax.name, amount, rate: tax.rate, tax_type: tax.tax_type, is_inclusive: true });
  }

  const subtotalExTax = Math.round((itemsTotal - inclusiveTaxTotal) * 100) / 100;

  // Second pass: exclusive taxes (added on top)
  let runningExclusive = 0;
  for (const tax of sorted) {
    if (tax.is_inclusive) continue;
    let amount = 0;
    if (tax.tax_type === "percent") {
      amount = itemsTotal * tax.rate / 100;
    } else if (tax.tax_type === "fixed") {
      amount = tax.rate;
    } else if (tax.tax_type === "compound_percent") {
      // Compound: applied on (itemsTotal + previous exclusive taxes)
      amount = (itemsTotal + runningExclusive) * tax.rate / 100;
    }
    amount = Math.round(amount * 100) / 100;
    runningExclusive += amount;
    exclusiveTaxTotal += amount;
    lines.push({ name: tax.name, amount, rate: tax.rate, tax_type: tax.tax_type, is_inclusive: false });
  }

  const totalTax = inclusiveTaxTotal + exclusiveTaxTotal;
  const grandTotal = Math.round((itemsTotal + exclusiveTaxTotal) * 100) / 100;

  return { lines, subtotalExTax, totalTax, grandTotal };
}

/**
 * Format a single item's tax for display in the menu builder.
 */
export function formatItemTaxBreakdown(price: number, taxes: TaxConfig[]): string {
  if (taxes.length === 0) return "";
  const { lines } = calculateTaxes(price, taxes);
  return lines.map((l) => `${l.name}: $${l.amount.toFixed(2)}`).join(" · ");
}
