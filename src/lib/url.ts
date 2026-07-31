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
 * Returns the URL if it is a safe link scheme (http/https/mailto/tel),
 * otherwise undefined. Use for user-facing links that may legitimately be
 * email or phone links.
 */
export function safeLinkUrl(raw: unknown): string | undefined {
  const u = parse(raw);
  return u && LINK_SCHEMES.has(u.protocol) ? u.href : undefined;
}
