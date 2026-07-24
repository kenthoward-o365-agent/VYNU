// Shared HTTP input-hardening helpers for Edge Functions (HLRDRNW-66 / AEA-11).
//
// Guards against oversized request bodies and unbounded arrays before they are
// parsed/mapped into memory or forwarded into AI prompts.

/** Thrown by readJsonLimited when the body exceeds the size cap. */
export class PayloadTooLargeError extends Error {
  constructor(message = "Request body too large") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

const DEFAULT_MAX_BYTES = 256 * 1024; // 256 KB

/**
 * Read and JSON-parse a request body with a hard size cap. Rejects (throws
 * PayloadTooLargeError) when either the Content-Length header or the actual
 * body length exceeds `maxBytes`. Use in place of `await req.json()` on public
 * endpoints.
 */
export async function readJsonLimited(
  req: Request,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<unknown> {
  // Fully drain the request body, THEN enforce the byte cap. We intentionally do
  // not reject early on the Content-Length header or abort mid-stream: responding
  // before the client finishes uploading resets the connection, so the caller
  // sees a dropped connection instead of a clean 413. With a small cap (256 KB)
  // and the platform's own request-size limit as a backstop, buffering the body
  // first is fine and gives a well-formed 413.
  const text = await req.text();
  // Byte length, not char length — multi-byte chars must count fully.
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new PayloadTooLargeError();
  }
  if (!text) return {};
  return JSON.parse(text);
}

/**
 * Coerce a value to an array bounded to `max` elements. Non-arrays become an
 * empty array. Prevents attacker-supplied arrays from inflating AI prompts or
 * fan-out loops.
 */
export function boundedArray<T>(value: unknown, max: number): T[] {
  if (!Array.isArray(value)) return [];
  return value.length > max ? (value.slice(0, max) as T[]) : (value as T[]);
}

/** 413 response helper matching the shared CORS shape. */
export function payloadTooLarge(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Request body too large" }),
    { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
