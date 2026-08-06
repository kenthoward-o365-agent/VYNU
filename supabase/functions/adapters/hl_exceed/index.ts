// H&L Exceed POS adapter — Web Orders API.
// Spec: https://developer.hlpos.com/reference/addorder
//
// - Auth: OAuth2 client_credentials (see _shared/hl-weborders-client.ts)
// - sendOrder: POST /api/order
// - pullOrderStatus: GET /api/order/{reference}
// - verifyWebhook: HMAC-SHA256 over raw body using shared_secret
//
// Menu pull/push are not exposed by the public H&L Web Orders API and remain
// stubbed; H&L sync of menu data still flows via the on-prem Menu Service in
// a separate integration to be re-scoped after live creds are issued.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  PosAdapter,
  PosAdapterContext,
  NormalisedMenu,
  OutboundOrder,
} from "../../_shared/pos-adapter.ts";
import {
  getHLToken,
  getOrder,
  mapOutboundOrder,
  missingOrderIds,
  postOrder,
  probeWebOrders,
  verifyHLSignature,
} from "../../_shared/hl-weborders-client.ts";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const adapter: PosAdapter = {
  slug: "hl_exceed",

  async authenticate(ctx) {
    const tok = await getHLToken(admin(), ctx);
    return { token: tok.access_token, expiresAt: tok.expires_at };
  },

  async testConnection(ctx) {
    const db = admin();

    // 1. Per-venue identifiers. Without these an order is addressed to nobody, and
    //    num() would silently coerce them to 0 at send time instead of erroring.
    const missing = missingOrderIds(ctx);
    if (missing.length > 0) {
      return { ok: false, message: `Missing required configuration: ${missing.join(", ")}` };
    }

    // 2. Credentials — proves the token URL, audience, client id and secret.
    let token;
    try {
      token = await getHLToken(db, ctx);
      ctx.tokenCache = token;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
    if (!token.access_token) return { ok: false, message: "No access token returned" };

    // 3. The orders host itself, which the credential check never touches.
    const probe = await probeWebOrders(db, ctx);
    if (!probe.ok) return probe;

    return { ok: true, message: `OAuth token acquired — ${probe.message}` };
  },

  async pullMenu(_ctx): Promise<NormalisedMenu> {
    // Not supported by the public Web Orders API.
    return { categories: [], items: [], modifierGroups: [] };
  },

  async pushMenu(_ctx, _menu) {
    return { ok: false, error: "Menu push not supported via H&L Web Orders API" };
  },

  async sendOrder(ctx, order: OutboundOrder) {
    const { payload, unmapped } = mapOutboundOrder(order, ctx);
    const res = await postOrder(admin(), ctx, payload);
    return {
      posOrderId: payload.header.reference,
      accepted: res.status >= 200 && res.status < 300,
      raw: res.body,
      unmapped,
    };
  },

  // Custom helper used by pos-hl-order-get (not part of the PosAdapter
  // interface yet; called via direct import there).
  verifyWebhook(_ctx: PosAdapterContext, _headers: Headers, _rawBody: string): boolean {
    // Real check is async — webhook function calls verifyHLSignature directly.
    return false;
  },
};

export async function hlPullOrderStatus(ctx: PosAdapterContext, reference: string) {
  return await getOrder(admin(), ctx, reference);
}

// Back-compat re-export so the existing pos-hl-webhook import keeps working.
export async function hlExceedVerifySignature(secret: string, rawBody: string, providedHex: string) {
  return await verifyHLSignature(secret, rawBody, providedHex);
}

export default adapter;
