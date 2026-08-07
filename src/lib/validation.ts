/**
 * Shared zod schemas for diner-facing forms.
 *
 * Single source of truth for what counts as a valid email, mobile number or
 * name, so signup and the SMS receipt capture cannot drift apart. Before this,
 * signup accepted the single letter "a" as an email address — it only checked
 * that the field was non-empty — and the receipt form only checked the phone
 * was non-blank before handing it to Twilio.
 *
 * These are UX guards. They stop obvious mistakes at the point of entry; they
 * are not a substitute for server-side validation.
 */
import { z } from "zod";
import { getPasswordScore } from "@/lib/password";

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
