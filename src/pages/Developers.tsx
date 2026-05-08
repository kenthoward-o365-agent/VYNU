import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20 space-y-3">
    <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
    <div className="text-muted-foreground space-y-3 leading-relaxed">{children}</div>
  </section>
);

const Code = ({ children }: { children: string }) => (
  <pre className="bg-muted text-foreground rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed border border-border">
    <code>{children}</code>
  </pre>
);

const Endpoint = ({ method, path, desc, scope }: { method: string; path: string; desc: string; scope: string }) => (
  <div className="border border-border rounded-lg p-4 space-y-1 bg-card">
    <div className="flex items-center gap-2 font-mono text-sm">
      <Badge variant={method === "GET" ? "secondary" : "default"}>{method}</Badge>
      <span className="text-foreground">{path}</span>
      <span className="ml-auto text-xs text-muted-foreground">scope: <code className="bg-muted px-1 rounded">{scope}</code></span>
    </div>
    <p className="text-sm text-muted-foreground">{desc}</p>
  </div>
);

export default function Developers() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">H&L OrderNow <span className="text-primary">Developers</span></Link>
          <Button asChild variant="outline" size="sm">
            <a href="mailto:partners@shyndig.com.au?subject=API%20access%20request">Get API access</a>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1 text-sm">
            {[
              ["intro", "Introduction"],
              ["auth", "Authentication"],
              ["versioning", "Versioning"],
              ["errors", "Errors"],
              ["filtering", "Filtering & Pagination"],
              ["idempotency", "Idempotency"],
              ["ratelimits", "Rate limits"],
              ["webhooks", "Webhooks"],
              ["pos", "POS API"],
              ["crm", "CRM API"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block px-3 py-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="space-y-12 max-w-3xl">
          <Section id="intro" title="H&L OrderNow Public API v1">
            <p>The H&L OrderNow Public API lets POS vendors and CRM/loyalty platforms integrate with venues running on H&L OrderNow. The API is split into two strictly separated surfaces:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 not-prose">
              <Card className="p-4 space-y-1">
                <Badge>POS API</Badge>
                <p className="text-sm text-muted-foreground">Read orders, push status updates, sync menus, snooze items, set busy mode.</p>
              </Card>
              <Card className="p-4 space-y-1">
                <Badge variant="secondary">CRM API</Badge>
                <p className="text-sm text-muted-foreground">Read diner profiles, visit history, issue and track loyalty vouchers.</p>
              </Card>
            </div>
            <p><strong className="text-foreground">Keys are not interchangeable.</strong> A POS key cannot read diner PII; a CRM key cannot push order status. To integrate both surfaces, request two separate partner accounts.</p>
          </Section>

          <Section id="auth" title="Authentication">
            <p>All requests require a Bearer token in the <code className="bg-muted px-1 rounded">Authorization</code> header. Keys are prefixed by surface and environment:</p>
            <Code>{`sk_pos_live_xxxxxxxxxxxx.SECRET   # POS partner
sk_crm_live_xxxxxxxxxxxx.SECRET   # CRM partner`}</Code>
            <Code>{`curl https://api.shyndig.io/v1/orders \\
  -H "Authorization: Bearer sk_pos_live_xxxx.SECRET" \\
  -H "Accept-Version: 1.0"`}</Code>
            <p>Sending a POS key to a CRM endpoint (or vice versa) returns <code className="bg-muted px-1 rounded">403 invalid_key_type</code>.</p>
          </Section>

          <Section id="versioning" title="Versioning">
            <p>The URL prefix <code className="bg-muted px-1 rounded">/v1</code> is stable. Minor versions are negotiated via <code className="bg-muted px-1 rounded">Accept-Version: 1.0</code>. Breaking changes only ship under <code className="bg-muted px-1 rounded">/v2</code>.</p>
          </Section>

          <Section id="errors" title="Errors">
            <Code>{`{
  "error": {
    "code": "invalid_scope",
    "message": "Missing required scope: orders:write",
    "request_id": "8f2c…"
  }
}`}</Code>
            <p>Common codes: <code>missing_auth</code>, <code>invalid_key</code>, <code>invalid_key_type</code>, <code>invalid_scope</code>, <code>not_found</code>, <code>invalid_body</code>, <code>internal_error</code>.</p>
          </Section>

          <Section id="filtering" title="Filtering, Sorting & Pagination">
            <p>Filter using <code>field__op=value</code>. Supported ops: <code>eq</code>, <code>neq</code>, <code>gt</code>, <code>gte</code>, <code>lt</code>, <code>lte</code>, <code>in</code>, <code>contains</code>.</p>
            <Code>{`GET /v1/orders?status__in=received,preparing&created_at__gte=2026-05-01&sortBy=created_at:desc&page=1&pageSize=50`}</Code>
            <p>Responses include a <code>meta</code> object with <code>totalCount</code>, <code>page</code>, and <code>pageSize</code>.</p>
          </Section>

          <Section id="idempotency" title="Idempotency">
            <p>Pass an <code className="bg-muted px-1 rounded">Idempotency-Key</code> header on POST/PATCH requests. Replays within 24 hours return the cached response with header <code>Idempotent-Replay: true</code>.</p>
          </Section>

          <Section id="ratelimits" title="Rate limits">
            <p>600 requests per minute per key. Exceeding returns <code>429 too_many_requests</code>. Inspect <code>X-RateLimit-Remaining</code>.</p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>H&L OrderNow pushes events to URLs you register. Each request includes:</p>
            <Code>{`X-H&L OrderNow-Event: order.status_changed
X-H&L OrderNow-Signature: <hex HMAC-SHA256 of body using webhook secret>`}</Code>
            <p>Verify signatures before trusting payloads. Failed deliveries (non-2xx) retry at 1m, 5m, 30m, 2h, 12h.</p>
          </Section>

          <Section id="pos" title="POS API">
            <p>Requires a <code>sk_pos_*</code> key. Base path: <code>/v1</code>.</p>
            <div className="space-y-2 not-prose">
              <Endpoint method="GET" path="/v1/orders" desc="List orders with filtering and pagination." scope="orders:read" />
              <Endpoint method="GET" path="/v1/orders/:id" desc="Fetch one order with line items, modifiers, and table." scope="orders:read" />
              <Endpoint method="PATCH" path="/v1/orders/:id/status" desc="Update order status: received, preparing, ready, served, paid, cancelled." scope="status:write" />
              <Endpoint method="POST" path="/v1/menu" desc="Publish a full menu snapshot (categories, items, modifiers) keyed by PLU." scope="menu:write" />
              <Endpoint method="PATCH" path="/v1/products/:plu/snooze" desc="Temporarily 86 an item. Body: { until: ISO8601 | null }." scope="snooze:write" />
              <Endpoint method="PATCH" path="/v1/locations/:venue_id/busy-mode" desc="Add extra prep minutes to in-flight orders during a rush." scope="busy:write" />
            </div>
            <Code>{`# Push status update
curl -X PATCH https://api.shyndig.io/v1/orders/abc-123/status \\
  -H "Authorization: Bearer sk_pos_live_xxxx.SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"preparing"}'`}</Code>
          </Section>

          <Section id="crm" title="CRM / Loyalty API">
            <p>Requires a <code>sk_crm_*</code> key. Base path: <code>/v1</code>.</p>
            <div className="space-y-2 not-prose">
              <Endpoint method="GET" path="/v1/contacts" desc="List diners who have visited the venue." scope="diners:read" />
              <Endpoint method="GET" path="/v1/contacts/:id" desc="Fetch a single diner profile." scope="diners:read" />
              <Endpoint method="GET" path="/v1/contacts/:id/visits" desc="Visit history (totals + dates only — no line items)." scope="visits:read" />
              <Endpoint method="POST" path="/v1/vouchers" desc="Issue a voucher / loyalty reward to a diner." scope="vouchers:write" />
              <Endpoint method="GET" path="/v1/vouchers/:id" desc="Look up voucher status and redemption." scope="vouchers:read" />
            </div>
            <Code>{`# Issue a voucher
curl -X POST https://api.shyndig.io/v1/vouchers \\
  -H "Authorization: Bearer sk_crm_live_xxxx.SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "diner_id":"…",
    "program_id":"…",
    "reward_kind":"discount_percent",
    "reward_payload":{"percent":15,"expires_at":"2026-12-31"}
  }'`}</Code>
          </Section>

          <div className="border-t border-border pt-8">
            <p className="text-sm text-muted-foreground">Need access? Email <a className="text-primary underline" href="mailto:partners@shyndig.com.au">partners@shyndig.com.au</a> with your company name, integration type (POS or CRM), and which venues you'll be working with.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
