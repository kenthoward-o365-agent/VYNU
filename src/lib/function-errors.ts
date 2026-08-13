import { FunctionsHttpError } from "@supabase/supabase-js";

const GENERIC_FALLBACK = "Something went wrong. Please try again.";

/**
 * Resolves a human-readable message from a `supabase.functions.invoke()` result.
 *
 * On a non-2xx response supabase-js throws away the body and reports
 * "Edge Function returned a non-2xx status code" — our functions send a real
 * explanation (`{ error, message }`) that the user never sees. The body is
 * still available on `FunctionsHttpError.context`, so read it back and prefer
 * `message`, then the `error` code, before falling back.
 *
 * Also covers functions that return 200 with an `error` field in the payload.
 *
 * Only 4xx bodies are shown. Every user-actionable refusal our functions send
 * is a 4xx (validation, auth, feature gating); 5xx bodies are either generic or
 * a raw exception message, and surfacing those would leak Postgres text, env
 * var names and upstream internals to the caller — the exact exposure
 * `_shared/safe-error.ts` exists to prevent. 5xx detail is logged instead.
 *
 * @returns the message to show, or `null` when the call succeeded.
 */
export async function functionErrorMessage(
  { data, error }: { data?: unknown; error?: unknown },
  fallback: string = GENERIC_FALLBACK,
): Promise<string | null> {
  if (error) {
    if (error instanceof FunctionsHttpError) {
      // `context` is the raw Response; its body carries the real reason.
      const fromBody = await readBodyMessage(error.context);
      return fromBody ?? fallback;
    }
    // Network / relay failures do carry a useful message.
    const message = (error as { message?: unknown })?.message;
    return typeof message === "string" && message.trim() ? message : fallback;
  }

  // 200 responses are only a failure when they actually say so, otherwise a
  // successful `{ message: "..." }` payload would read as an error.
  if (data && typeof data === "object" && (data as { error?: unknown }).error) {
    return pickMessage(data) ?? fallback;
  }
  return null;
}

async function readBodyMessage(context: unknown): Promise<string | null> {
  if (!context || typeof (context as Response).json !== "function") return null;
  const response = context as Response;
  try {
    const body = await response.json();
    if (response.status >= 500) {
      // Never surface raw exception text (including via the browser console).
      console.error("Edge function failed", response.status);
      return null;
    }
    return pickMessage(body);
  } catch {
    // Body was empty or not JSON — nothing better than the fallback.
    return null;
  }
}

function pickMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { message, error } = body as { message?: unknown; error?: unknown };
  for (const candidate of [message, error]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}
