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
  checkContactPhone,
  optionalContactPhoneSchema,
  optionalEmailSchema,
  optionalPostcodeSchema,
  httpUrlSchema,
  venueDetailsSchema,
  staffUserSchema,
  staffEditSchema,
  dinerProfileSchema,
  partnerSchema,
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

  it("rejects a bare country code — 61 is not a phone number", () => {
    expect(normalizeAuPhone("61")).toBeNull();
    expect(normalizeAuPhone("+61")).toBeNull();
  });

  it("rejects a stray + rather than silently stripping it", () => {
    // Previously "0412345678+" normalised to "+0412345678+".
    expect(normalizeAuPhone("0412345678+")).toBeNull();
    expect(normalizeAuPhone("04+12345678")).toBeNull();
    expect(normalizeAuPhone("++61412345678")).toBeNull();
  });

  it("never returns a value with more than one +", () => {
    for (const v of ["+61412345678", "0412345678", "+61 412 345 678", "412345678"]) {
      const out = normalizeAuPhone(v);
      if (out !== null) expect(out.match(/\+/g)?.length).toBe(1);
    }
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

describe("checkContactPhone", () => {
  it('rejects "hello" — a venue saved with this as its phone number', () => {
    expect(checkContactPhone("hello")).toBeNull();
  });

  it.each(["", "   ", "abc123456789", "555-CALL-NOW", "12345", "1234567890123456"])(
    "rejects %j",
    (v) => expect(checkContactPhone(v)).toBeNull(),
  );

  it("rejects a + that is not the first character", () => {
    expect(checkContactPhone("0412+345678")).toBeNull();
  });

  it.each([
    "0412 345 678",
    "(02) 9999 8888",
    "02 9999 8888",
    "+61 412 345 678",
    "1300 123 456",
    "+1 (555) 123-4567",
  ])("accepts %j", (v) => expect(checkContactPhone(v)).not.toBeNull());

  it("keeps the number as typed rather than normalising it", () => {
    // A venue phone is a display value and may be a landline, which
    // normalizeAuPhone would mangle into "+0299998888".
    expect(checkContactPhone("(02) 9999 8888")).toBe("(02) 9999 8888");
  });

  it("trims surrounding whitespace", () => {
    expect(checkContactPhone("  0412 345 678  ")).toBe("0412 345 678");
  });
});

describe("optionalContactPhoneSchema", () => {
  it("treats blank as absent", () => {
    expect(optionalContactPhoneSchema.parse("")).toBeUndefined();
    expect(optionalContactPhoneSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects a non-blank value that is not a phone number", () => {
    expect(optionalContactPhoneSchema.safeParse("hello").success).toBe(false);
  });
});

describe("optionalEmailSchema", () => {
  it("treats blank as absent — venues need not have an email", () => {
    expect(optionalEmailSchema.parse("")).toBeUndefined();
    expect(optionalEmailSchema.parse(undefined)).toBeUndefined();
  });

  it('rejects "test" — a venue saved with this as its email', () => {
    expect(optionalEmailSchema.safeParse("test").success).toBe(false);
  });

  it("accepts and trims a real address", () => {
    expect(optionalEmailSchema.parse(" venue@example.com ")).toBe("venue@example.com");
  });
});

describe("optionalPostcodeSchema", () => {
  it.each(["abc", "12", "123456", "20 00", "1a23"])(
    "rejects %j",
    (v) => expect(optionalPostcodeSchema.safeParse(v).success).toBe(false),
  );

  it.each(["2000", "0800"])(
    "accepts %j",
    (v) => expect(optionalPostcodeSchema.safeParse(v).success).toBe(true),
  );

  it("treats blank as absent", () => {
    expect(optionalPostcodeSchema.parse("")).toBeUndefined();
  });
});

describe("httpUrlSchema", () => {
  it("adds a scheme to a bare host rather than rejecting it", () => {
    expect(httpUrlSchema.parse("partner.example.com/hook")).toBe("https://partner.example.com/hook");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "not a url", ""])(
    "rejects %j",
    (v) => expect(httpUrlSchema.safeParse(v).success).toBe(false),
  );

  it("keeps an explicit https URL", () => {
    expect(httpUrlSchema.parse("https://example.com/webhook")).toBe("https://example.com/webhook");
  });
});

describe("venueDetailsSchema", () => {
  const valid = {
    name: "The Corner Café",
    address: "1 Test St",
    city: "Sydney",
    state: "NSW",
    postcode: "2000",
    phone: "02 9999 8888",
    email: "venue@example.com",
  };

  it("accepts a fully populated venue", () => {
    expect(venueDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects the exact bad save this ticket exists for", () => {
    // Reproduces the reported bug: a venue saved with phone "hello" and
    // email "test" went straight into the venues table.
    const r = venueDetailsSchema.safeParse({ ...valid, phone: "hello", email: "test" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(errs.phone).toMatch(/valid phone/i);
      expect(errs.email).toMatch(/valid email/i);
    }
  });

  it("requires a name", () => {
    expect(venueDetailsSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("allows contact details to be omitted entirely", () => {
    const r = venueDetailsSchema.safeParse({ name: "Minimal Venue" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBeUndefined();
      expect(r.data.email).toBeUndefined();
    }
  });
});

describe("staffUserSchema", () => {
  it("rejects an invalid email", () => {
    expect(staffUserSchema.safeParse({ email: "test", password: "longenough1" }).success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    expect(staffUserSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });

  it("does NOT apply the diner signup strength rules", () => {
    // Deliberate: tightening this would change who an admin can create.
    expect(staffUserSchema.safeParse({ email: "a@b.com", password: "alllowercase" }).success).toBe(true);
  });
});

describe("staffEditSchema", () => {
  it("treats a blank password as leave-unchanged", () => {
    expect(staffEditSchema.safeParse({ display_name: "Jane", password: "" }).success).toBe(true);
  });

  it("rejects a short password when one is being set", () => {
    expect(staffEditSchema.safeParse({ display_name: "Jane", password: "short" }).success).toBe(false);
  });
});

describe("dinerProfileSchema", () => {
  it("allows a diner with a phone and no email, and the reverse", () => {
    expect(dinerProfileSchema.safeParse({ phone: "0412 345 678" }).success).toBe(true);
    expect(dinerProfileSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("preserves an international number's + rather than stripping it", () => {
    // diner_profiles.phone holds E.164 from signup; staff edits must not
    // silently drop the country code.
    expect(dinerProfileSchema.parse({ phone: "+61412345678" }).phone).toBe("+61412345678");
  });

  it("rejects junk in either field", () => {
    expect(dinerProfileSchema.safeParse({ email: "test" }).success).toBe(false);
    expect(dinerProfileSchema.safeParse({ phone: "hello" }).success).toBe(false);
  });
});

describe("partnerSchema", () => {
  it("requires a name but not an email", () => {
    expect(partnerSchema.safeParse({ name: "Acme POS" }).success).toBe(true);
    expect(partnerSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a malformed contact email", () => {
    expect(partnerSchema.safeParse({ name: "Acme POS", contact_email: "test" }).success).toBe(false);
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
