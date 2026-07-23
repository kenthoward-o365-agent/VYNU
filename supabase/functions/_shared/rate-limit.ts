// Shared distributed rate limiter for Edge Functions (HLRDRNW-66 / AEA-02).
//
// Serverless functions are horizontally scaled and share no memory, so an
// in-process Map counter is ineffective. This helper delegates to the
// `check_rate_limit` Postgres RPC, which keeps an atomic fixed-window counter
// that every function instance sees. Call it with a service-role client.
//
// Usage:
//   const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
//   const rl = await enforceRateLimit(admin, [
//     { key: `send-sms:order:${orderId}`, limit: 3,   windowSec: 86400 },
//     { key: `send-sms:phone:${phone}`,   limit: 5,   windowSec: 3600  },
//     { key: `send-sms:ip:${ip}`,         limit: 10,  windowSec: 3600  },
//   ]);
//   if (!rl.allowed) return tooManyRequests(corsHeaders);

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** The first rule that was exceeded, if any. */
  exceeded?: RateLimitRule;
}

export interface RateLimitOptions {
  /**
   * When the limiter RPC itself errors, deny the request instead of allowing it.
   * Use for the highest-value endpoints (SMS sending, live payments) where an
   * open failure mode would re-expose the abuse path. Defaults to false
   * (fail-open) so a transient DB issue never blocks ordinary traffic.
   */
  failClosed?: boolean;
}

/**
 * Extract the best-effort client IP from proxy headers. Returns "unknown" when
 * none is present (so the caller still gets a stable bucket rather than
 * silently disabling the IP dimension).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Enforce one or more rate-limit rules. All rules are checked (each increments
 * its own counter); the request is allowed only if none is exceeded.
 *
 * Fail-open policy: if the RPC itself errors (e.g. transient DB issue) the
 * request is allowed, so a limiter outage never takes down a legitimate flow.
 * Abuse is still bounded by the other controls on each endpoint.
 */
export async function enforceRateLimit(
  admin: AdminClient,
  rules: RateLimitRule | RateLimitRule[],
  opts: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const list = Array.isArray(rules) ? rules : [rules];
  const failClosed = opts.failClosed ?? false;
  let exceeded: RateLimitRule | undefined;

  for (const rule of list) {
    let ruleAllowed = true;
    try {
      const { data, error } = await admin.rpc("check_rate_limit", {
        _bucket: rule.key,
        _limit: rule.limit,
        _window_seconds: rule.windowSec,
      });
      if (error) {
        console.error("rate-limit rpc error", rule.key, error.message);
        ruleAllowed = !failClosed; // fail-open unless configured otherwise
      } else if (data === false) {
        ruleAllowed = false;
      }
    } catch (e) {
      console.error("rate-limit rpc threw", rule.key, e);
      ruleAllowed = !failClosed;
    }
    if (!ruleAllowed) {
      exceeded = rule;
      break; // L2: don't burn quota on the remaining dimensions once rejected
    }
  }

  return { allowed: !exceeded, exceeded };
}

/** Standard 429 response. */
export function tooManyRequests(
  corsHeaders: Record<string, string>,
  retryAfterSec = 60,
): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again later." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
