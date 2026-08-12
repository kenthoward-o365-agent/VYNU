import { describe, it, expect } from "vitest";
import { FunctionsHttpError, FunctionsFetchError } from "@supabase/supabase-js";
import { functionErrorMessage } from "./function-errors";

/** Mirrors what supabase-js hands back for a non-2xx edge function response. */
const httpError = (body: unknown, status = 403) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

describe("functionErrorMessage", () => {
  it("reads the message out of a non-2xx body instead of the generic SDK text", async () => {
    const error = httpError({
      error: "feature_not_included",
      feature: "ai.menu_import",
      message: "This feature is not included in the venue's current package.",
    });

    expect(error.message).toBe("Edge Function returned a non-2xx status code");
    await expect(functionErrorMessage({ error })).resolves.toBe(
      "This feature is not included in the venue's current package.",
    );
  });

  it("falls back to the error code when the body has no message", async () => {
    const error = httpError({ error: "forbidden" });
    await expect(functionErrorMessage({ error })).resolves.toBe("forbidden");
  });

  it("never surfaces a 5xx body, which may carry raw exception text", async () => {
    const error = httpError({ error: 'relation "venue_x" does not exist' }, 500);
    await expect(functionErrorMessage({ error }, "Failed to load insights")).resolves.toBe(
      "Failed to load insights",
    );
  });

  it("uses the caller's fallback when the body is not JSON", async () => {
    const error = new FunctionsHttpError(new Response("<html>502</html>", { status: 502 }));
    await expect(functionErrorMessage({ error }, "Import failed")).resolves.toBe("Import failed");
  });

  it("keeps the real message for network failures", async () => {
    const error = new FunctionsFetchError("Failed to send a request to the Edge Function");
    await expect(functionErrorMessage({ error })).resolves.toBe(
      "Failed to send a request to the Edge Function",
    );
  });

  it("catches functions that report an error in a 200 payload", async () => {
    await expect(
      functionErrorMessage({ data: { error: "no_menu_found", message: "No menu found at that URL." } }),
    ).resolves.toBe("No menu found at that URL.");
  });

  it("returns null on success", async () => {
    await expect(
      functionErrorMessage({ data: { items_created: 12, categories_created: 3 } }),
    ).resolves.toBeNull();
  });

  it("does not mistake a successful message payload for a failure", async () => {
    await expect(functionErrorMessage({ data: { message: "Queued" } })).resolves.toBeNull();
  });
});
