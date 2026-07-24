// Constant-time string comparison for secrets and signatures (HLRDRNW-66 / L6).
//
// Plain `a === b` short-circuits on the first differing character, so response
// timing can leak how many leading characters of a guess were correct. Use this
// for comparing bearer tokens, cron secrets, and HMAC signatures.

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  // Length mismatch is reported immediately — this only leaks the length, which
  // is not secret for fixed-size tokens/signatures.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
