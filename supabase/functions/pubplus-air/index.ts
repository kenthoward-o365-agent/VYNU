// Pub+ (ALH) integration via the Eagle Eye AIR platform.
//
// Auth (docs/api-authentication):
//   X-EES-AUTH-CLIENT-ID: <clientId>
//   X-EES-AUTH-HASH:      sha256(uriPath + queryString + rawBody + secret)  (hex)
//
// Actions:
//   test    { group_id }                      -> ping the wallet service
//   link    { group_id, identity_value }      -> resolve the diner's Pub+ wallet from their card barcode
//   unlink  { group_id }                      -> forget the link
//   balance { group_id }                      -> refresh the points balance
//   earn    { order_id }                      -> post the paid basket to Eagle Eye (openSettle)
//   redeem  { group_id, points, order_id? }   -> burn points against the Eagle Eye account
//
// When credentials are absent the function runs in SIMULATION mode: everything is
// recorded locally so the diner flow can be demoed end-to-end before ALH issue keys.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const CLIENT_SECRET = Deno.env.get("PUBPLUS_EE_CLIENT_SECRET") ?? "";

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Cfg {
  id: string;
  group_id: string;
  enabled: boolean;
  base_url: string;
  client_id: string | null;
  parent_identity_number: string | null;
  identity_type: string;
  auto_earn_on_paid: boolean;
}

/** Base URL is expected to already include the /2.0 service prefix. */
function splitBase(baseUrl: string) {
  const u = new URL(baseUrl.replace(/\/+$/, ""));
  return { origin: u.origin, prefix: u.pathname === "/" ? "" : u.pathname };
}

interface EEResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  simulated?: boolean;
}

async function eeFetch(
  cfg: Cfg,
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
): Promise<EEResult> {
  if (!cfg.client_id || !CLIENT_SECRET) {
    return { ok: false, status: 0, data: null, error: "not_configured", simulated: true };
  }
  const { origin, prefix } = splitBase(cfg.base_url);
  const qs = opts.query && Object.keys(opts.query).length
    ? "?" + new URLSearchParams(opts.query).toString()
    : "";
  const rawBody = opts.body === undefined ? "" : JSON.stringify(opts.body);
  // The hash is computed over the service path (without the host), the query
  // string and the exact bytes of the body.
  const hash = await sha256Hex(`${prefix}${path}${qs}${rawBody}${CLIENT_SECRET}`);

  const res = await fetch(`${origin}${prefix}${path}${qs}`, {
    method,
    headers: {
      "X-EES-AUTH-CLIENT-ID": cfg.client_id,
      "X-EES-AUTH-HASH": hash,
      "Content-Type": "application/json",
    },
    body: rawBody === "" ? undefined : rawBody,
  });

  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (!res.ok) {
    console.error(`Eagle Eye ${method} ${path} failed [${res.status}]: ${text}`);
    return { ok: false, status: res.status, data: parsed, error: text.slice(0, 500) };
  }
  return { ok: true, status: res.status, data: parsed };
}

async function loadConfig(admin: SupabaseClient, groupId: string): Promise<Cfg | null> {
  const { data } = await admin
    .from("pubplus_integrations")
    .select("id, group_id, enabled, base_url, client_id, parent_identity_number, identity_type, auto_earn_on_paid")
    .eq("group_id", groupId)
    .maybeSingle();
  return (data as Cfg) ?? null;
}

async function logTx(admin: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await admin.from("pubplus_transactions").insert(row);
  if (error) console.error("pubplus_transactions insert failed", error.message);
}

/** Pull the first POINTS-style account and its balance for a wallet. */
async function readPointsAccount(cfg: Cfg, walletId: string) {
  const res = await eeFetch(cfg, "GET", `/wallet/${walletId}/account`);
  if (!res.ok) return { accountId: null as string | null, balance: 0, res };
  const accounts: any[] = res.data?.accounts ?? res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  const points = accounts.find((a) =>
    String(a?.type ?? a?.accountType ?? "").toUpperCase().includes("POINT")
  ) ?? accounts[0];
  const balance = Number(
    points?.balances?.current ?? points?.balances?.available ?? points?.balance ?? 0,
  ) || 0;
  return { accountId: points?.accountId ?? points?.id ?? null, balance, res };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const action = String(body.action ?? "");

    const { data: dinerProfile } = await admin
      .from("diner_profiles").select("id").eq("user_id", user.id).maybeSingle();
    const dinerId: string | null = dinerProfile?.id ?? null;

    // ---------------------------------------------------------------- test
    if (action === "test") {
      const cfg = await loadConfig(admin, String(body.group_id ?? ""));
      if (!cfg) return json({ ok: false, message: "Save the integration settings first." });
      if (!cfg.client_id || !CLIENT_SECRET) {
        return json({
          ok: false,
          message: "Missing credentials — set the client ID here and PUBPLUS_EE_CLIENT_SECRET as a backend secret.",
        });
      }
      const probe = cfg.parent_identity_number
        ? await eeFetch(cfg, "GET", `/wallet/identity/${encodeURIComponent(cfg.parent_identity_number)}`)
        : await eeFetch(cfg, "GET", "/wallet", { query: { "identity-value": "connection-test" } });

      const ok = probe.ok || probe.status === 404; // 404 = auth accepted, identity unknown
      await admin.from("pubplus_integrations").update({
        last_test_at: new Date().toISOString(),
        last_test_ok: ok,
        last_test_message: ok ? `Eagle Eye reachable (HTTP ${probe.status})` : (probe.error ?? "Request failed"),
      }).eq("id", cfg.id);
      await logTx(admin, {
        group_id: cfg.group_id, kind: "test", status: ok ? "ok" : "failed",
        error_message: ok ? null : probe.error, response: probe.data ?? {},
      });
      return json({
        ok,
        status: probe.status,
        message: ok
          ? `Authenticated with Eagle Eye AIR (HTTP ${probe.status}).`
          : `Eagle Eye returned ${probe.status}: ${probe.error ?? "unknown error"}`,
      });
    }

    // ---------------------------------------------------------------- link
    if (action === "link") {
      if (!dinerId) return json({ error: "No diner profile for this user" }, 403);
      const groupId = String(body.group_id ?? "");
      const identityValue = String(body.identity_value ?? "").trim();
      if (!groupId || !identityValue) return json({ error: "group_id and identity_value are required" }, 400);

      const cfg = await loadConfig(admin, groupId);
      const simulated = !cfg?.enabled || !cfg?.client_id || !CLIENT_SECRET;

      let walletId: string | null = null;
      let consumerId: string | null = null;
      let accountId: string | null = null;
      let balance = 0;
      let lastError: string | null = null;

      if (!simulated && cfg) {
        const w = await eeFetch(cfg, "GET", `/wallet/identity/${encodeURIComponent(identityValue)}`);
        if (!w.ok) {
          await logTx(admin, {
            diner_id: dinerId, group_id: groupId, kind: "link", status: "failed",
            error_message: w.error ?? `HTTP ${w.status}`, payload: { identity_value: identityValue },
          });
          return json({
            ok: false,
            status: w.status,
            message: w.status === 404
              ? "We couldn't find that Pub+ card number. Check the digits under the barcode."
              : `Pub+ lookup failed (HTTP ${w.status}).`,
          }, w.status === 404 ? 404 : 502);
        }
        const wallet = w.data?.wallet ?? w.data;
        walletId = String(wallet?.walletId ?? wallet?.id ?? "");
        consumerId = wallet?.consumerId ? String(wallet.consumerId) : null;
        if (walletId) {
          const acct = await readPointsAccount(cfg, walletId);
          accountId = acct.accountId;
          balance = acct.balance;
          if (!acct.res.ok) lastError = acct.res.error ?? null;
        }
      }

      const { data: link, error } = await admin
        .from("pubplus_member_links")
        .upsert({
          diner_id: dinerId,
          group_id: groupId,
          identity_value: identityValue,
          identity_type: cfg?.identity_type ?? "BARCODE",
          ee_wallet_id: walletId,
          ee_consumer_id: consumerId,
          ee_account_id: accountId,
          points_balance: balance,
          status: "linked",
          last_synced_at: new Date().toISOString(),
          last_error: lastError,
        }, { onConflict: "diner_id,group_id" })
        .select()
        .single();
      if (error) {
        // upsert onConflict on a partial/expression index can fail — fall back.
        const { data: existing } = await admin
          .from("pubplus_member_links").select("id").eq("diner_id", dinerId).eq("group_id", groupId).maybeSingle();
        if (!existing) return json({ error: error.message }, 500);
        await admin.from("pubplus_member_links").update({
          identity_value: identityValue, ee_wallet_id: walletId, ee_consumer_id: consumerId,
          ee_account_id: accountId, points_balance: balance, status: "linked",
          last_synced_at: new Date().toISOString(), last_error: lastError,
        }).eq("id", existing.id);
      }

      await logTx(admin, {
        diner_id: dinerId, group_id: groupId, kind: "link",
        status: simulated ? "skipped" : "ok",
        payload: { identity_value: identityValue },
        response: { wallet_id: walletId, balance },
      });

      return json({ ok: true, simulated, wallet_id: walletId, points_balance: balance, link: link ?? null });
    }

    // -------------------------------------------------------------- unlink
    if (action === "unlink") {
      if (!dinerId) return json({ error: "No diner profile for this user" }, 403);
      await admin.from("pubplus_member_links")
        .update({ status: "unlinked" })
        .eq("diner_id", dinerId)
        .eq("group_id", String(body.group_id ?? ""));
      return json({ ok: true });
    }

    // ------------------------------------------------------------- balance
    if (action === "balance") {
      if (!dinerId) return json({ error: "No diner profile for this user" }, 403);
      const groupId = String(body.group_id ?? "");
      const { data: link } = await admin
        .from("pubplus_member_links").select("*")
        .eq("diner_id", dinerId).eq("group_id", groupId).maybeSingle();
      if (!link) return json({ ok: false, message: "No Pub+ membership linked" }, 404);

      const cfg = await loadConfig(admin, groupId);
      if (!cfg?.enabled || !cfg.client_id || !CLIENT_SECRET || !link.ee_wallet_id) {
        return json({ ok: true, simulated: true, points_balance: link.points_balance });
      }
      const acct = await readPointsAccount(cfg, link.ee_wallet_id);
      if (!acct.res.ok) return json({ ok: false, message: `Balance check failed (HTTP ${acct.res.status})` }, 502);
      await admin.from("pubplus_member_links").update({
        points_balance: acct.balance,
        ee_account_id: acct.accountId ?? link.ee_account_id,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", link.id);
      return json({ ok: true, points_balance: acct.balance });
    }

    // ---------------------------------------------------------------- earn
    if (action === "earn") {
      const orderId = String(body.order_id ?? "");
      if (!orderId) return json({ error: "order_id is required" }, 400);

      const { data: order } = await admin
        .from("orders")
        .select("id, venue_id, diner_id, total, created_at")
        .eq("id", orderId)
        .maybeSingle();
      if (!order) return json({ error: "Order not found" }, 404);

      const { data: isStaff } = await admin.rpc("is_venue_staff", {
        _user_id: user.id, _venue_id: order.venue_id,
      });
      const isOwner = !!dinerId && dinerId === order.diner_id;
      if (!isStaff && !isOwner) return json({ error: "Not authorized for this order" }, 403);
      if (!order.diner_id) return json({ ok: false, message: "Guest order — nothing to post to Pub+" });

      const { data: venue } = await admin
        .from("venues").select("id, name, group_id, site_id").eq("id", order.venue_id).maybeSingle();
      const groupId = venue?.group_id;
      if (!groupId) return json({ ok: false, message: "Venue is not in a Pub+ group" });

      const cfg = await loadConfig(admin, groupId);
      const { data: link } = await admin
        .from("pubplus_member_links").select("*")
        .eq("diner_id", order.diner_id).eq("group_id", groupId).eq("status", "linked").maybeSingle();
      if (!link) return json({ ok: false, message: "Diner has no linked Pub+ membership" });

      // Duplicate guard — one earn per order.
      const { data: dupe } = await admin
        .from("pubplus_transactions").select("id")
        .eq("order_id", orderId).eq("kind", "earn").eq("status", "ok").maybeSingle();
      if (dupe) return json({ ok: true, duplicate: true });

      const { data: items } = await admin
        .from("order_items").select("id, name, quantity, price, menu_item_id").eq("order_id", orderId);

      const amountCents = Math.round(Number(order.total ?? 0) * 100);
      const basket = {
        type: "STANDARD",
        summary: {
          adjustmentResults: [],
          totalItems: (items ?? []).reduce((n, i: any) => n + Number(i.quantity ?? 1), 0),
          totalBasketValue: amountCents,
        },
        contents: (items ?? []).map((i: any, idx: number) => ({
          upc: i.menu_item_id ?? `item-${idx}`,
          description: i.name,
          itemUnitCost: Math.round(Number(i.price ?? 0) * 100),
          itemUnitMetric: "UNT",
          itemQuantity: Number(i.quantity ?? 1),
          salesKey: "SALE",
          totalCost: Math.round(Number(i.price ?? 0) * 100 * Number(i.quantity ?? 1)),
        })),
      };

      const payload = {
        reference: `ordernow-${orderId}`,
        identity: { type: link.identity_type ?? "BARCODE", value: link.identity_value },
        location: { incomingIdentifier: venue?.site_id ? String(venue.site_id) : venue?.id },
        basket,
        options: { addRelatedAccountsToWallet: true },
      };

      if (!cfg?.enabled || !cfg.client_id || !CLIENT_SECRET) {
        await logTx(admin, {
          diner_id: order.diner_id, venue_id: order.venue_id, group_id: groupId, order_id: orderId,
          kind: "earn", status: "skipped", amount_cents: amountCents, payload,
          error_message: "Pub+ integration not configured — points kept in OrderNOW only",
        });
        return json({ ok: true, simulated: true, message: "Pub+ not configured; local points only" });
      }

      const res = await eeFetch(cfg, "POST", "/wallet/openSettle", { body: payload });
      const pointsDelta = Number(
        res.data?.wallet?.accounts?.[0]?.balances?.pointsAdded ??
        res.data?.accounts?.[0]?.balances?.current ?? 0,
      ) || 0;

      await logTx(admin, {
        diner_id: order.diner_id, venue_id: order.venue_id, group_id: groupId, order_id: orderId,
        kind: "earn", status: res.ok ? "ok" : "failed", amount_cents: amountCents,
        points_delta: pointsDelta, ee_reference: payload.reference,
        payload, response: res.data ?? {}, error_message: res.ok ? null : (res.error ?? `HTTP ${res.status}`),
      });

      if (res.ok) {
        const acct = await readPointsAccount(cfg, String(link.ee_wallet_id ?? ""));
        if (acct.res.ok) {
          await admin.from("pubplus_member_links").update({
            points_balance: acct.balance, last_synced_at: new Date().toISOString(),
          }).eq("id", link.id);
        }
      }

      return json({ ok: res.ok, status: res.status, points: pointsDelta, error: res.ok ? undefined : res.error });
    }

    // -------------------------------------------------------------- redeem
    if (action === "redeem") {
      if (!dinerId) return json({ error: "No diner profile for this user" }, 403);
      const groupId = String(body.group_id ?? "");
      const points = Math.abs(Number(body.points ?? 0));
      if (!groupId || !points) return json({ error: "group_id and points are required" }, 400);

      const cfg = await loadConfig(admin, groupId);
      const { data: link } = await admin
        .from("pubplus_member_links").select("*")
        .eq("diner_id", dinerId).eq("group_id", groupId).eq("status", "linked").maybeSingle();
      if (!link) return json({ ok: false, message: "No Pub+ membership linked" }, 404);
      if (!cfg?.enabled || !cfg.client_id || !CLIENT_SECRET || !link.ee_wallet_id || !link.ee_account_id) {
        return json({ ok: false, message: "Pub+ redemption is not available yet" }, 400);
      }

      const res = await eeFetch(cfg, "POST", `/wallet/${link.ee_wallet_id}/account/${link.ee_account_id}/redeem`, {
        body: { accountId: link.ee_account_id, walletId: link.ee_wallet_id, balances: { current: -points } },
      });
      await logTx(admin, {
        diner_id: dinerId, group_id: groupId, order_id: body.order_id ?? null, kind: "redeem",
        status: res.ok ? "ok" : "failed", points_delta: -points,
        payload: { points }, response: res.data ?? {}, error_message: res.ok ? null : res.error,
      });
      if (!res.ok) return json({ ok: false, message: `Redemption failed (HTTP ${res.status})` }, 502);

      const acct = await readPointsAccount(cfg, link.ee_wallet_id);
      if (acct.res.ok) {
        await admin.from("pubplus_member_links").update({
          points_balance: acct.balance, last_synced_at: new Date().toISOString(),
        }).eq("id", link.id);
      }
      return json({ ok: true, points_balance: acct.balance });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("pubplus-air error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
