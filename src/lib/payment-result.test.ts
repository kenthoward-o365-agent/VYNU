import { describe, it, expect } from "vitest";
import { assertPaymentResult, isContinuationResult } from "./payment-result";

/**
 * These two functions decide whether a diner is shown success or failure, so a
 * regression here silently marks unpaid orders as paid. The cases below mirror the
 * real responses that motivated the guard.
 */

/** Minimal stand-in for the parts of Response the guard reads. */
const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

describe("assertPaymentResult", () => {
  it("accepts an authorised payment", () => {
    expect(() =>
      assertPaymentResult(res(200), { resultCode: "Authorised", pspReference: "ABC123" })
    ).not.toThrow();
  });

  it("accepts a refusal — a refusal is a valid outcome, not a transport failure", () => {
    expect(() =>
      assertPaymentResult(res(200), { resultCode: "Refused", refusalReason: "Declined" })
    ).not.toThrow();
  });

  it("accepts a 3DS continuation", () => {
    expect(() =>
      assertPaymentResult(res(200), { resultCode: "ChallengeShopper", action: { type: "threeDS2" } })
    ).not.toThrow();
  });

  it("throws on a 429 from the rate limiter, surfacing the server message", () => {
    expect(() =>
      assertPaymentResult(res(429), { error: "Too many requests. Please slow down and try again later." })
    ).toThrow(/Too many requests/);
  });

  it("throws on a sanitised 500, which carries only a generic message", () => {
    expect(() =>
      assertPaymentResult(res(500), { error: "VYNU Pay processing error", correlation_id: "abc-123" })
    ).toThrow(/VYNU Pay processing error/);
  });

  it("throws with the status when a non-2xx body has no error field", () => {
    expect(() => assertPaymentResult(res(502), {})).toThrow(/HTTP 502/);
  });

  it("throws on a 2xx that carries an upstream error body instead of a resultCode", () => {
    // The real shape that slipped through: adyen-payment relays Adyen failures
    // with HTTP 200, e.g. error 217 for a missing shopperInteraction.
    expect(() =>
      assertPaymentResult(res(200), {
        status: 403,
        errorCode: "217",
        message: "Field 'shopperInteraction' is missing or not valid.",
        errorType: "security",
      })
    ).toThrow(/not recognised/);
  });

  it("throws when resultCode is present but not a string", () => {
    expect(() => assertPaymentResult(res(200), { resultCode: 200 })).toThrow(/not recognised/);
  });

  it("throws on a null body", () => {
    expect(() => assertPaymentResult(res(200), null)).toThrow(/not recognised/);
  });
});

describe("isContinuationResult", () => {
  it.each([
    "RedirectShopper",
    "IdentifyShopper",
    "ChallengeShopper",
    "PresentToShopper",
    "Pending",
    "Received",
  ])("treats %s as a continuation the Drop-in owns", (code) => {
    expect(isContinuationResult(code)).toBe(true);
  });

  it.each(["Authorised", "Refused", "Error", "Cancelled"])(
    "treats %s as terminal",
    (code) => {
      expect(isContinuationResult(code)).toBe(false);
    }
  );

  it("treats a missing resultCode as terminal so it is handled as a failure", () => {
    expect(isContinuationResult(undefined)).toBe(false);
    expect(isContinuationResult(null)).toBe(false);
    expect(isContinuationResult("")).toBe(false);
  });
});
