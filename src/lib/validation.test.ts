/**
 * The case that motivated this: signup accepted the single letter "a" as an
 * email address, because it only checked the field was non-empty.
 *
 * normalizeAuPhone is asserted against the same cases as the server copy in
 * supabase/functions/send-receipt-sms/index.ts. If these two drift, the client
 * accepts numbers the server rejects and receipts silently fail to arrive.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeAuPhone,
  emailSchema,
  nameSchema,
  auMobileSchema,
  optionalAuMobileSchema,
  optionalInternationalPhoneSchema,
  newPasswordSchema,
  signupSchema,
  signinSchema,
  smsReceiptSchema,
  fieldErrors,
  checkField,
} from "./validation";

describe("emailSchema", () => {
  it('rejects "a" — the bug this ticket exists for', () => {
    expect(emailSchema.safeParse("a").success).toBe(false);
  });

  it.each(["", "   ", "no-at-sign", "@nolocal.com", "trailing@", "two@@at.com"])(
    "rejects %j",
    (v) => expect(emailSchema.safeParse(v).success).toBe(false),
  );

  it.each(["jane@example.com", "jane.smith+tag@sub.example.co.uk"])(
    "accepts %j",
    (v) => expect(emailSchema.safeParse(v).success).toBe(true),
  );

  it("trims surrounding whitespace", () => {
    expect(emailSchema.parse("  jane@example.com  ")).toBe("jane@example.com");
  });
});

describe("nameSchema", () => {
  it("rejects blank and whitespace-only", () => {
    expect(nameSchema("First name").safeParse("").success).toBe(false);
    expect(nameSchema("First name").safeParse("   ").success).toBe(false);
  });

  it("uses the label in the message", () => {
    const r = nameSchema("Last name").safeParse("");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Last name is required");
  });

  it("accepts and trims a real name", () => {
    expect(nameSchema("First name").parse("  Jane ")).toBe("Jane");
  });
});

describe("normalizeAuPhone", () => {
  it.each([
    ["0412345678", "+61412345678"],
    ["0412 345 678", "+61412345678"],
    ["412345678", "+61412345678"],
    ["61412345678", "+61412345678"],
    ["+61412345678", "+61412345678"],
    ["+441234567890", "+441234567890"],
  ])("normalises %s -> %s", (input, expected) => {
    expect(normalizeAuPhone(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "12345", "+123", "04123", "61", "04+12345678"])("rejects %j", (v) => {
    expect(normalizeAuPhone(v)).toBeNull();
  });
});

describe("auMobileSchema", () => {
  it("returns the E.164 form, not the raw input", () => {
    expect(auMobileSchema.parse("0412 345 678")).toBe("+61412345678");
  });

  it("rejects a too-short number with a helpful message", () => {
    const r = auMobileSchema.safeParse("0412");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/valid mobile number/i);
  });

  it("requires a value", () => {
    expect(auMobileSchema.safeParse("").success).toBe(false);
  });
});

describe("optionalAuMobileSchema", () => {
  it("allows blank", () => {
    expect(optionalAuMobileSchema.parse("")).toBeUndefined();
    expect(optionalAuMobileSchema.parse(undefined)).toBeUndefined();
  });

  it("still validates anything actually entered", () => {
    expect(optionalAuMobileSchema.safeParse("123").success).toBe(false);
    expect(optionalAuMobileSchema.parse("0412345678")).toBe("+61412345678");
  });
});

describe("optionalInternationalPhoneSchema", () => {
  it("allows blank", () => {
    expect(optionalInternationalPhoneSchema.parse("")).toBeUndefined();
  });

  it("accepts non-AU numbers that the AU schema would reject", () => {
    expect(optionalInternationalPhoneSchema.safeParse("20 7946 0958").success).toBe(true);
  });

  it("still rejects obvious rubbish", () => {
    expect(optionalInternationalPhoneSchema.safeParse("abc").success).toBe(false);
    expect(optionalInternationalPhoneSchema.safeParse("123").success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("rejects under 8 characters", () => {
    expect(newPasswordSchema.safeParse("Ab1!x").success).toBe(false);
  });

  it("rejects long but weak passwords", () => {
    expect(newPasswordSchema.safeParse("aaaaaaaaaaaa").success).toBe(false);
  });

  it("accepts a password meeting 3 of 5 checks", () => {
    expect(newPasswordSchema.safeParse("Password1").success).toBe(true);
  });
});

describe("signupSchema", () => {
  const valid = {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    password: "Password1",
    phone: "0412345678",
  };

  it("accepts a complete valid signup", () => {
    const r = signupSchema.parse(valid);
    expect(r.phone).toBe("0412345678");
    expect(r.email).toBe("jane@example.com");
  });

  it("accepts an international number — signup has its own country selector", () => {
    expect(signupSchema.safeParse({ ...valid, phone: "20 7946 0958" }).success).toBe(true);
  });

  it("accepts signup without a phone", () => {
    expect(signupSchema.safeParse({ ...valid, phone: "" }).success).toBe(true);
  });

  it("reports every invalid field at once", () => {
    const r = signupSchema.safeParse({
      firstName: "",
      lastName: "",
      email: "a",
      password: "short",
      phone: "abc",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(Object.keys(errs).sort()).toEqual(
        ["email", "firstName", "lastName", "password", "phone"].sort(),
      );
    }
  });
});

describe("signinSchema", () => {
  it("does NOT apply strength rules — existing accounts must still sign in", () => {
    expect(signinSchema.safeParse({ email: "a@b.com", password: "old" }).success).toBe(true);
  });

  it("still requires a well-formed email", () => {
    expect(signinSchema.safeParse({ email: "a", password: "whatever" }).success).toBe(false);
  });

  it("requires a password", () => {
    expect(signinSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("smsReceiptSchema", () => {
  it("normalises before the number reaches the SMS function", () => {
    expect(smsReceiptSchema.parse({ phone: "0412 345 678" }).phone).toBe("+61412345678");
  });

  it("rejects a blank number", () => {
    expect(smsReceiptSchema.safeParse({ phone: "  " }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("fieldErrors keeps only the first message per field", () => {
    const r = signupSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      email: "a",
      password: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(typeof errs.email).toBe("string");
      expect(errs.email).toMatch(/valid email/i);
    }
  });

  it("checkField returns null when valid and a message when not", () => {
    expect(checkField(emailSchema, "jane@example.com")).toBeNull();
    expect(checkField(emailSchema, "a")).toMatch(/valid email/i);
  });
});
