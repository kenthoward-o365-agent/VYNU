/**
 * HLRDRNW-68 · IVA-04 — URL scheme allow-list for values that come from the
 * database, AI output, or scraped content and are rendered into `href`/`src`.
 *
 * A `javascript:`, `data:`, or `vbscript:` URL surviving into an anchor `href`
 * executes when clicked. These helpers return the URL only when its scheme is
 * safe, and `undefined` otherwise, so callers can drop or neutralise it.
 */

const HTTP_SCHEMES = new Set(["http:", "https:"]);
const LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

const parse = (raw: unknown): URL | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
};

/** Returns the URL if it is an http(s) URL, otherwise undefined. */
export function safeHttpUrl(raw: unknown): string | undefined {
  const u = parse(raw);
  return u && HTTP_SCHEMES.has(u.protocol) ? u.href : undefined;
}

/**
 * Normalises an operator-entered URL for storage.
 *
 * `url`-typed config fields render as plain text inputs, so a scheme-less value
 * like "handl-sandbox.au.auth0.com/oauth/token" saves happily and only fails much
 * later inside fetch() as "Invalid URL". Prepends https:// when no scheme is
 * present, then keeps the value only if it parses as http(s) — javascript:/data:
 * and other schemes are rejected.
 *
 * Returns "" for blank input, and null when the value cannot be salvaged.
 */
export function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return safeHttpUrl(withScheme) ?? null;
}

/**
 * Returns the URL if it is a safe link scheme (http/https/mailto/tel),
 * otherwise undefined. Use for user-facing links that may legitimately be
 * email or phone links.
 */
export function safeLinkUrl(raw: unknown): string | undefined {
  const u = parse(raw);
  return u && LINK_SCHEMES.has(u.protocol) ? u.href : undefined;
}
