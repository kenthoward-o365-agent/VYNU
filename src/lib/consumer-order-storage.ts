/**
 * Storage keys shared between the diner ordering flow and anything that needs
 * to read its state from outside — currently the error boundary fallback,
 * which has to tell a diner whether their order was placed after the screen
 * has already crashed.
 *
 * Single source of truth on purpose: if the writer and the reader disagree
 * about this key, the fallback tells the diner the opposite of the truth about
 * whether they have been charged.
 */

/** Holds the id of the most recent order placed at this venue + table. */
export const lastOrderKey = (venueId?: string, tableId?: string) =>
  `shyndig.lastOrder.${venueId || "_"}.${tableId || "_"}`;

/**
 * Reads the placed-order marker, tolerating storage being unavailable.
 * Returns undefined when storage cannot be read at all, which callers must
 * treat as "unknown" rather than "no order".
 */
export function readLastOrderId(
  venueId?: string,
  tableId?: string,
): string | null | undefined {
  try {
    return localStorage.getItem(lastOrderKey(venueId, tableId));
  } catch {
    return undefined;
  }
}
