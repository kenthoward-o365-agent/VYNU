/**
 * Shared zod schemas for every form in the app.
 *
 * Single source of truth for what counts as a valid email, mobile number or
 * name, so signup and the SMS receipt capture cannot drift apart. Before this,
 * signup accepted the single letter "a" as an email address — it only checked
 * that the field was non-empty — and the receipt form only checked the phone
 * was non-blank before handing it to Twilio.
 *
 * The staff- and admin-facing forms had the same hole for longer: Create/Edit
 * Venue wrote straight to the `venues` table, so a venue saved with the phone
 * "hello" and the email "test" — both of which then showed on the diner-facing
 * landing page and were handed to the receipt sender.
 *
 * These are UX guards. They stop obvious mistakes at the point of entry; they
 * are not a substitute for server-side validation.
 */
import { z } from "zod";
import { getPasswordScore } from "@/lib/password";
import { normalizeHttpUrl } from "@/lib/url";

/**
 * Normalises an Australian mobile to E.164.
 *
 * Deliberately mirrors normalizeAuPhone() in
 * supabase/functions/send-receipt-sms/index.ts. If the two disagree, the client
 * accepts numbers the server then rejects (or the reverse) and the diner sees a
 * receipt silently fail to arrive. Keep them in step.
 *
 * Returns null when the input cannot be resolved to a plausible number.
 */
export function normalizeAuPhone(raw: string): string | null {
  const trimmed = raw.trim();
  // A "+" is only meaningful as the very first character. Anything else is
  // malformed, and silently stripping it risks texting a different number than
  // the diner intended, so reject rather than guess.
  const plusCount = (trimmed.match(/\+/g) || []).length;
  if (plusCount > 1 || (plusCount === 1 && !trimmed.startsWith("+"))) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (hadPlus) return digits.length >= 8 ? "+" + digits : null;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  // Length check applies here too: a bare "61" is a country code, not a number.
  if (digits.startsWith("61") && digits.length >= 8) return "+" + digits;
  return digits.length >= 8 ? "+" + digits : null;
}

/** Trimmed, non-empty, and actually shaped like an email address. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required")
  .email("Enter a valid email address");

export const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} is too long`);

/**
 * Mobile number for SMS. Validates and normalises in one step, so callers get
 * the E.164 form the backend expects rather than whatever the diner typed.
 */
export const auMobileSchema = z
  .string()
  .trim()
  .min(1, "Mobile number is required")
  .transform((v, ctx) => {
    const normalised = normalizeAuPhone(v);
    if (!normalised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid mobile number, e.g. 0412 345 678",
      });
      return z.NEVER;
    }
    return normalised;
  });

/** Optional variant: blank is fine, but anything entered must be valid. */
export const optionalAuMobileSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const normalised = normalizeAuPhone(v);
    if (!normalised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid mobile number, e.g. 0412 345 678",
      });
      return z.NEVER;
    }
    return normalised;
  });

/**
 * Account-creation password. Mirrors the existing UI gate — 8 characters and at
 * least 3 of the 5 strength checks — so wiring this in does not silently change
 * who can create an account.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((pw) => getPasswordScore(pw) >= 3, {
    message: "Use a stronger password — add uppercase, numbers or symbols",
  });

/**
 * Signup carries an explicit country selector, so the AU rules above must not
 * be applied there — they would reject valid international numbers. All we can
 * reasonably assert without a per-country library is "if something was typed,
 * it looks like a phone number".
 */
export const optionalInternationalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const digits = v.replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid mobile number",
      });
      return z.NEVER;
    }
    return digits;
  });

/* ────────────────────────────────────────────────────────────────────────────
 * Contact details on the staff- and admin-facing forms
 *
 * These fields differ from the diner ones above in one important way: they are
 * NOT normalised. A venue's phone number is a display value — it is rendered on
 * the landing page and dialled by a human — and it may legitimately be a
 * landline ("(02) 9999 8888"), which normalizeAuPhone() above would mangle into
 * "+0299998888" because it only knows how to resolve mobiles. Likewise a diner
 * row edited by staff may hold any country's number.
 *
 * So we check the shape and keep what was typed. That is enough to reject
 * "hello" while leaving valid formatting the operator chose intact.
 * ──────────────────────────────────────────────────────────────────────────── */

/** E.164 caps a number at 15 digits; 8 is the shortest we treat as plausible. */
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

/** Digits plus the separators people actually type. Notably excludes letters. */
const PHONE_CHARS = /^[+]?[\d\s().-]+$/;

const PHONE_MESSAGE = "Enter a valid phone number, e.g. 02 9999 8888 or 0412 345 678";

/**
 * Shape-checks a contact phone without rewriting it. Returns the trimmed input
 * when it is plausible, or null when it is not.
 */
export function checkContactPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // A "+" is only meaningful as the first character — same rule as
  // normalizeAuPhone, so the two cannot disagree about what is malformed.
  if (!PHONE_CHARS.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
  return trimmed;
}

const contactPhoneRefinement = (v: string, ctx: z.RefinementCtx) => {
  const checked = checkContactPhone(v);
  if (!checked) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_MESSAGE });
    return z.NEVER;
  }
  return checked;
};

/** Contact phone, kept as typed. Required — blank is rejected. */
export const contactPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform(contactPhoneRefinement);

/**
 * Contact phone, kept as typed. Blank is fine; anything entered must be valid.
 * Still used for diner rows, where staff often hold a number or an email but
 * not both.
 */
export const optionalContactPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => (v ? contactPhoneRefinement(v, ctx) : undefined));

/** Blank is fine, but anything entered must look like an email address. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const result = emailSchema.safeParse(v);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid email address" });
      return z.NEVER;
    }
    return result.data;
  });

/**
 * Australian postcodes are exactly four digits.
 *
 * The digit count is all we check — not the allocated 0200–9999 range. Four
 * digits already rejects every realistic typo ("abc", "20 00", a phone number
 * pasted into the wrong box), whereas encoding the range buys very little and
 * would wrongly reject a venue recorded against a non-AU postcode.
 */
export const optionalPostcodeSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    if (!/^\d{4}$/.test(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Postcode must be 4 digits" });
      return z.NEVER;
    }
    return v;
  });

/** Free-text field that is optional but must not be pure whitespace padding. */
export const optionalTextSchema = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .optional()
    .transform((v) => v || undefined);

/**
 * An http(s) URL. Leans on normalizeHttpUrl() so a scheme-less
 * "partner.example.com/hook" is saved as "https://partner.example.com/hook"
 * rather than failing much later inside fetch(), and so javascript:/data: URLs
 * are rejected outright.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .transform((v, ctx) => {
    const normalised = normalizeHttpUrl(v);
    if (!normalised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid http(s) URL, e.g. https://example.com",
      });
      return z.NEVER;
    }
    return normalised;
  });

/**
 * Venue contact details, shared by all four places a venue can be created or
 * edited: the admin Create Venue dialog, the admin venue detail page, the
 * operator's own Settings page, and first-run Onboarding. They wrote to the same
 * columns with four different (or absent) sets of rules before this.
 *
 * Name, phone and email are mandatory. All three are diner-facing — they render
 * on the venue's landing page — so a venue with no contact number is not a
 * useful record. Note the `venues` columns stay nullable and rows created before
 * this rule may hold nulls; the consequence is that editing such a venue now
 * requires filling in the missing contact details before any other change to it
 * can be saved.
 *
 * Address, city, state and postcode remain optional.
 */
export const venueDetailsSchema = z.object({
  name: nameSchema("Venue name"),
  address: optionalTextSchema("Address"),
  city: optionalTextSchema("City", 80),
  state: optionalTextSchema("State", 40),
  postcode: optionalPostcodeSchema,
  phone: contactPhoneSchema,
  email: emailSchema,
});

/**
 * Creating a staff or admin login. The 8-character floor deliberately matches
 * the gate these dialogs already applied — tightening it to the diner signup
 * strength rules would change who an admin can create, which is a separate
 * decision from fixing unvalidated input.
 */
export const staffUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: optionalTextSchema("Display name", 80),
});

/** Editing an existing staff member. Password is a blank-means-unchanged reset. */
export const staffEditSchema = z.object({
  display_name: optionalTextSchema("Display name", 80),
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 8, "Password must be at least 8 characters"),
});

/**
 * A diner row edited by venue staff. Every field is optional — staff routinely
 * hold a phone number for a diner and no email, or the reverse.
 */
export const dinerProfileSchema = z.object({
  display_name: optionalTextSchema("Name", 80),
  email: optionalEmailSchema,
  phone: optionalContactPhoneSchema,
});

export const partnerSchema = z.object({
  name: nameSchema("Partner name"),
  contact_email: optionalEmailSchema,
});

export const signupSchema = z.object({
  firstName: nameSchema("First name"),
  lastName: nameSchema("Last name"),
  email: emailSchema,
  password: newPasswordSchema,
  phone: optionalInternationalPhoneSchema,
});

/**
 * Sign-in intentionally does NOT apply the strength rules: existing accounts
 * predate them and would be locked out. Format-checking the email is still
 * worth it — it turns a confusing auth failure into a clear field error.
 */
export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const smsReceiptSchema = z.object({
  phone: auMobileSchema,
});

export type SignupInput = z.input<typeof signupSchema>;
export type SigninInput = z.input<typeof signinSchema>;

/**
 * Flattens a ZodError into { field: firstMessage } for inline display.
 * Only the first message per field — showing a stack of errors under one input
 * is noise.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Validates one field in isolation; returns the message, or null when valid. */
export function checkField(schema: z.ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}
