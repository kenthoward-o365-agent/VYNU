// AU-centric mobile normalisation, shared by the diner checkout and mirrored
// in supabase/functions/notify-order-ready (Deno can't import from src/).
// Keep the two in sync: a number the checkout accepts must be one the
// notifier can send to.

/** Normalise a raw phone entry to E.164. Returns null when unusable. */
export function normalizeAuPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 8 ? digits : null;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  if (digits.startsWith("61")) return "+" + digits;
  return digits.length >= 8 ? "+" + digits : null;
}
