/**
 * Guards for `adyen-payment` responses on the diner money path.
 *
 * The Drop-in handlers used to read `await resp.json()` without consulting
 * `resp.ok`, then branch only on `resultCode === "Authorised"` or an explicit
 * Refused/Error/Cancelled. Any other outcome fell through both branches in
 * silence — no cleanup, no message to the diner — and the Drop-in was resolved
 * with `resultCode: undefined`, which makes it render its own success screen.
 *
 * That mattered because non-tab orders are inserted with `payment_status: 'paid'`
 * before payment is attempted, so a silently-dropped failure left a paid order
 * with no PSP reference, showed the diner a green tick, and let the order fire to
 * the kitchen. A 429 from the rate limiter, a sanitised 500 with a correlation
 * id, or an upstream rejection relayed as a 400 all produce a body with no
 * `resultCode` and all took that path.
 *
 * These helpers make the money path fail closed: anything we cannot positively
 * read as a payment outcome is treated as a failure.
 */

/**
 * Result codes where the Drop-in owns the next step (3DS2 challenge, redirect,
 * voucher display). The final outcome arrives later via `onAdditionalDetails`,
 * so the caller must neither finalise nor clean up on these.
 */
const CONTINUATION_RESULT_CODES = new Set([
  "RedirectShopper",
  "IdentifyShopper",
  "ChallengeShopper",
  "PresentToShopper",
  "Pending",
  "Received",
]);

export function isContinuationResult(resultCode: unknown): boolean {
  return typeof resultCode === "string" && CONTINUATION_RESULT_CODES.has(resultCode);
}

/**
 * Throw unless `result` is a payment outcome we can act on. Call this straight
 * after parsing the response and BEFORE resolving the Drop-in, so a failure
 * reaches the caller's catch block (which cleans up the order and tells the
 * diner) instead of being reported as success.
 */
export function assertPaymentResult(resp: Response, result: any): void {
  if (!resp.ok) {
    // Server-side detail is already sanitised by safeErrorResponse; `error` is a
    // generic message, optionally with a correlation id for the logs.
    throw new Error(
      result?.error || `Payment could not be processed (HTTP ${resp.status})`
    );
  }
  if (!result || typeof result.resultCode !== "string") {
    throw new Error("Payment response was not recognised");
  }
}
