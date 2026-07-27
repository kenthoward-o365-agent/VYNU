// Shared client-error sanitizer for Edge Functions (HLRDRNW-67 / SEC-04).
//
// Problem: many functions returned `{ error: err.message }` (or full third-party
// response bodies) directly to the caller. That leaks Postgres error text and
// constraint names, internal env-var names (e.g. "STRIPE_SECRET_KEY" when the
// secret is unset), and upstream provider internals — all useful for recon and
// error-based enumeration, with no systemic guarantee a secret value never slips
// into a message.
//
// This helper is the single place that decides what the CLIENT sees: a generic
// message plus a correlation id. The full detail is logged SERVER-SIDE only,
// keyed by that same id, so operators can still trace an incident without
// exposing internals to callers.

/** Generate a correlation id to tie a client response to a server log line. */
export function newCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `err-${Date.now().toString(36)}`;
  }
}

/**
 * Log the full error server-side under a correlation id (never returned to the
 * client). Returns the id so the caller can echo it in the response.
 */
export function logError(context: string, err: unknown, correlationId?: string): string {
  const cid = correlationId ?? newCorrelationId();
  // Full detail stays in the platform-only edge logs.
  console.error(`[${context}] cid=${cid}`, err);
  return cid;
}

/**
 * Build a sanitized JSON error Response. Logs the detail server-side and returns
 * only a generic message + correlation id to the caller.
 *
 * Use in catch blocks in place of `new Response(JSON.stringify({ error: err.message }), …)`.
 */
export function safeErrorResponse(
  context: string,
  err: unknown,
  corsHeaders: Record<string, string>,
  status = 500,
  clientMessage = "An unexpected error occurred. Please try again.",
): Response {
  const cid = logError(context, err, newCorrelationId());
  return new Response(
    JSON.stringify({ error: clientMessage, correlation_id: cid }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
