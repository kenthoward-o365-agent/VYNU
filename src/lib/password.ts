/**
 * Shared password-strength rules for account creation.
 *
 * NOTE: This is a client-side UX guard only. The authoritative policy MUST
 * be enforced in Supabase Auth (min length + leaked-password protection) —
 * see the "Open Questions" in IDENTITY_ACCESS_SECURITY_PLAN.md. Login forms
 * must NOT apply this (it would lock out existing accounts).
 */

export interface PasswordCheck {
  label: string;
  met: boolean;
}

export function getPasswordChecks(pw: string): PasswordCheck[] {
  return [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(pw) },
    { label: "Contains lowercase letter", met: /[a-z]/.test(pw) },
    { label: "Contains a number", met: /\d/.test(pw) },
    { label: "Contains special character", met: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function getPasswordScore(pw: string): number {
  return getPasswordChecks(pw).filter((c) => c.met).length;
}

/** Minimum acceptable password for new accounts: 8+ chars and score >= 3. */
export function isPasswordAcceptable(pw: string): boolean {
  return pw.length >= 8 && getPasswordScore(pw) >= 3;
}

export const WEAK_PASSWORD_MESSAGE =
  "Password must be at least 8 characters and include a mix of upper/lowercase, numbers, or symbols.";
