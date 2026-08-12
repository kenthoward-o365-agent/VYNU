/**
 * HLRDRNW-19 — what the diner sees after placing an order.
 *
 * An order moves along two independent axes, and conflating them is what broke
 * the post-payment confirmation:
 *
 *   - `status`        fulfilment progress, owned by venue staff.
 *                     received → preparing → ready → served, then 'paid' when
 *                     the order is closed out / settled.
 *   - `payment_status` whether the money has moved. Stamped server-side by the
 *                     adyen-payment function on authorisation; the diner's
 *                     browser cannot write it (RLS grants it no UPDATE on
 *                     orders at all).
 *
 * The receipt used to be gated on `status === 'paid'`, which the client tried to
 * set itself. RLS denied that write and the error was discarded, so paid orders
 * sat at 'received' forever and the receipt never rendered.
 *
 * Lives outside the page so the decision can be unit tested without mounting
 * ConsumerOrder and its Supabase/session/realtime dependencies.
 */

export type FulfilmentStatus =
  | "received"
  | "preparing"
  | "ready"
  | "served"
  | "paid"
  | "cancelled"
  | "refunded";

/** The fields of an order this module needs. Deliberately narrow. */
export interface ConfirmableOrder {
  status: FulfilmentStatus;
  payment_status?: string | null;
}

/** Statuses where the kitchen still has work to do, so progress is worth showing. */
export const OPEN_ORDER_STATUSES: FulfilmentStatus[] = ["received", "preparing", "ready"];

/** Statuses after which there is nothing left to track. */
export const TERMINAL_ORDER_STATUSES = new Set<FulfilmentStatus>([
  "paid",
  "cancelled",
  "refunded",
]);

/**
 * True once payment is confirmed by the server. Anything other than the exact
 * 'paid' value — 'unpaid' on an open tab, 'refunded', 'void', or a null from an
 * older row — is not a paid confirmation.
 */
export const isOrderPaid = (order: ConfirmableOrder | null | undefined): boolean =>
  order?.payment_status === "paid";

/** Whether to show the received → served progress tracker. */
export const showsProgressTracker = (order: ConfirmableOrder | null | undefined): boolean =>
  !!order && OPEN_ORDER_STATUSES.includes(order.status);

/**
 * Whether to show the receipt / tax invoice. Independent of fulfilment: a diner
 * who has paid keeps their receipt while the kitchen works, and still has it
 * after the order is served.
 */
export const showsReceipt = (order: ConfirmableOrder | null | undefined): boolean =>
  isOrderPaid(order);
