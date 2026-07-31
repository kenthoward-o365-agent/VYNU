// HLRDRNW-68 · IVA-03 — shared SSRF guard for server-side fetches of
// user/DB-supplied URLs.
//
// A hostname string-match is not enough: a public hostname can resolve to a
// private/link-local IP (DNS rebinding), and IPv6 / IPv4-mapped forms slip past
// naive prefix checks. This guard requires http(s), resolves the host to its
// actual IP(s), and rejects if ANY resolved address is private, loopback,
// link-local, CGNAT, or the cloud-metadata address. Callers should still use
// `redirect: "manual"` so a 3xx to an internal host can't bypass the check.

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a >= 224) return true; // multicast / reserved
  return false;
};

const isPrivateIPv6 = (raw: string): boolean => {
  const ip = raw.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  // IPv4-mapped / -compatible (::ffff:a.b.c.d or ::ffff:aabb:ccdd) → classify the v4.
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIPv4(v4);
  }
  if (ip.startsWith("fe80")) return true; // link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
};

const looksLikeIPv4 = (h: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const looksLikeIPv6 = (h: string): boolean => h.includes(":");

/**
 * Validate a user/DB-supplied URL for safe server-side fetching.
 * Throws SsrfError if the scheme is not http(s) or the host resolves to a
 * private/reserved address. Returns the parsed URL on success.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http(s) URLs are allowed");
  }

  // WHATWG parsing normalises IPv4 literals (incl. decimal/octal/hex) to
  // dotted-quad; IPv6 hosts keep their surrounding brackets, which the IPv6
  // classifier strips before matching.
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SsrfError("URL host is not allowed");
  }

  // Collect the IP(s) this request would actually connect to.
  let ips: string[] = [];
  if (looksLikeIPv4(host)) {
    ips = [host];
  } else if (looksLikeIPv6(host)) {
    ips = [host];
  } else {
    // Real hostname → resolve. Any A/AAAA record pointing inside is a rebind.
    for (const kind of ["A", "AAAA"] as const) {
      try {
        const recs = await Deno.resolveDns(host, kind);
        ips.push(...recs);
      } catch {
        // No record of this kind is fine; other kind may still resolve.
      }
    }
    if (ips.length === 0) {
      throw new SsrfError("URL host could not be resolved");
    }
  }

  for (const ip of ips) {
    const unsafe = ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
    if (unsafe) {
      throw new SsrfError("URL host is not allowed");
    }
  }

  return url;
}
