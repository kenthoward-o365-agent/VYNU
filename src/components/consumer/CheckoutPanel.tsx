import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateTaxes, type TaxConfig } from "@/lib/tax-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, ArrowLeft, ShieldCheck, Trash2, Check, Receipt } from "lucide-react";
import ShyndigPayDropin from "./AdyenDropin";
import TabBillPanel from "./TabBillPanel";
import { money, type TabZoneRules } from "@/lib/tabs";
import { assertPaymentResult, isContinuationResult } from "@/lib/payment-result";

import type { SelectedModifier } from "./ItemDetailScreen";

export interface CartItem {
  /** Unique cart-line key (menu_item_id + modifier signature + notes). */
  id: string;
  menu_item_id: string;
  name: string;
  /** Base unit price (modifiers added per line) */
  price: number;
  quantity: number;
  modifiers: SelectedModifier[];
  notes: string;
  /** AI attribution (set when chat/upsell drove the add-to-cart). */
  aiSource?: "chat" | "upsell" | null;
  aiSessionId?: string | null;
}

interface StoredCard {
  id: string;
  token_reference: string;
  shopper_reference: string;
  card_summary: string | null;
  card_brand: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  is_default: boolean;
}

interface CheckoutPanelProps {
  items: CartItem[];
  venueId: string;
  tableId: string;
  dinerId: string | null;
  sessionMode?: "solo" | "group";
  joinedSessionId?: string | null;
  groupDisplayName?: string | null;
  onBack: () => void;
  onOrderPlaced: (orderId: string) => void;
}

const CheckoutPanel = ({
  items,
  venueId,
  tableId,
  dinerId,
  sessionMode = "solo",
  joinedSessionId = null,
  groupDisplayName = null,
  onBack,
  onOrderPlaced,
}: CheckoutPanelProps) => {
  // Per-line total includes base price + sum of modifier prices, all × quantity.
  const lineUnitPrice = (item: CartItem) =>
    item.price + item.modifiers.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const total = items.reduce((sum, item) => sum + lineUnitPrice(item) * item.quantity, 0);

  const [saveCard, setSaveCard] = useState(false);

  /**
   * Context for a payment that is mid-3DS.
   *
   * When Adyen returns a continuation code (ChallengeShopper / RedirectShopper /
   * IdentifyShopper) the final outcome arrives later in
   * handleDropinAdditionalDetails, which is a separate callback with no access to
   * the orderId or tabId from handleDropinSubmit. Without this the 3DS branch
   * resolved the Drop-in and stopped — the diner was charged but the order was
   * never finalised (no status change, no diner_visit, no loyalty points, no
   * navigation to the order screen) and a failed challenge never cleaned up.
   */
  const pendingPaymentRef = useRef<
    { kind: "order"; orderId: string } | { kind: "tab"; tabId: string } | null
  >(null);
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [selectedStoredCard, setSelectedStoredCard] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentEnabled, setPaymentEnabled] = useState<boolean | null>(null);
  const [paymentEnvironment, setPaymentEnvironment] = useState<"test" | "live">("test");
  const [venueTaxes, setVenueTaxes] = useState<TaxConfig[]>([]);
  const [gratuityOptions, setGratuityOptions] = useState<{ label: string; percent: number }[]>([]);
  const [gratuityEnabled, setGratuityEnabled] = useState(false);
  const [gratuityPrompt, setGratuityPrompt] = useState("Add a tip?");
  const [gratuityDecline, setGratuityDecline] = useState("No thanks");
  const [selectedTip, setSelectedTip] = useState<number | null>(null);

  // H&L Pay Drop-in state
  const [paymentMethodsResponse, setPaymentMethodsResponse] = useState<any>(null);
  const [shyndigPayClientKey, setShyndigPayClientKey] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);
  // Per-venue wallet identifiers returned by the backend (PAY-05) — no hardcoded
  // placeholders; wallet buttons are hidden when a venue's real id is missing.
  const [walletConfig, setWalletConfig] = useState<{
    applePayMerchantId: string | null;
    googlePayMerchantId: string | null;
    gatewayMerchantId: string | null;
  } | null>(null);

  // Open-tab state (per-zone: some areas run tabs, others are pay-at-order)
  const [tabRules, setTabRules] = useState<TabZoneRules | null>(null);
  const [tabMode, setTabMode] = useState<"pay_now" | "tab">("pay_now");
  const [showTabBill, setShowTabBill] = useState(false);

  useEffect(() => {
    checkPaymentEnabled();
    fetchVenueTaxes();
    fetchGratuityConfig();
    fetchTabRules();
    if (dinerId) fetchStoredCards();
  }, [venueId, dinerId]);


  // Once payments are confirmed enabled and we know the total, fetch Adyen methods for Drop-in
  useEffect(() => {
    if (paymentEnabled && total > 0 && !paymentMethodsResponse && !selectedStoredCard) {
      fetchPaymentMethods();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentEnabled, total + (selectedTip ?? 0)]);

  const fetchTabRules = async () => {
    if (!tableId) return;
    const { data, error } = await (supabase as any).rpc("get_table_tab_rules", {
      _venue_id: venueId,
      _table_id: tableId,
    });
    if (error) return;
    setTabRules(data as TabZoneRules);
  };


  const fetchGratuityConfig = async () => {
    const { data } = await supabase.rpc("get_venue_public_info", { _venue_id: venueId });
    const settings = (data as any)?.[0]?.settings;
    const grat = settings?.gratuities;
    if (grat?.enabled && grat?.options?.length) {
      setGratuityEnabled(true);
      setGratuityOptions(grat.options);
      if (grat.prompt) setGratuityPrompt(grat.prompt);
      if (grat.declineLabel) setGratuityDecline(grat.declineLabel);
    }
  };

  const tipAmount = selectedTip !== null ? selectedTip : 0;

  const fetchVenueTaxes = async () => {
    const { data } = await (supabase as any).rpc("get_venue_taxes_public", {
      _venue_id: venueId,
    });
    setVenueTaxes((data as any as TaxConfig[]) || []);
  };

  const checkPaymentEnabled = async () => {
    // Anon clients cannot read venue_payment_config directly.
    // Use the SECURITY DEFINER RPC that returns only the public-safe active flag.
    const { data } = await (supabase as any).rpc("get_venue_payment_active", {
      _venue_id: venueId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    setPaymentEnabled(!!row?.is_active);
    // Default to "test" until the payment_methods response tells us the venue's
    // real environment (PAY-07) — the Drop-in must initialise in the SAME
    // environment the server processes against.
    setPaymentEnvironment("test");
  };


  const fetchPaymentMethods = async () => {
    setLoadingMethods(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "payment_methods",
            venue_id: venueId,
            amount: total + tipAmount,
            currency: "AUD",
            country_code: "AU",
            shopper_reference: dinerId ? `diner_${dinerId}` : undefined,
          }),
        }
      );
      const data = await resp.json();
      if (data?.paymentMethods) {
        setPaymentMethodsResponse(data);
      }
      // Read client key returned by the H&L Pay backend (per-venue)
      const key = data?.client_key || (import.meta as any).env?.VITE_ADYEN_CLIENT_KEY || null;
      setShyndigPayClientKey(key);
      setIsMockMode(!!data?.mock_mode);
      // PAY-05: per-venue wallet identifiers (no hardcoded placeholders). Assigned
      // unconditionally — clearing when the response omits `wallets` — so a reload
      // for a different venue, or an error/older response, cannot leave the previous
      // venue's merchant ids in place and render a wallet button that should be
      // hidden. Fails closed, which is the point of sourcing these per venue.
      setWalletConfig(data?.wallets ?? null);
      // PAY-07: align the client Drop-in environment with the server's, falling back
      // to "test" rather than retaining a previous (possibly "live") value.
      setPaymentEnvironment(data?.environment === "live" ? "live" : "test");
    } catch (e) {
      console.error("Failed to load payment methods:", e);
      // Fail closed on error too: no wallet buttons, no inherited "live".
      setWalletConfig(null);
      setPaymentEnvironment("test");
    }
    setLoadingMethods(false);
  };

  const fetchStoredCards = async () => {
    if (!dinerId) return;
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "list_stored_cards",
            venue_id: venueId,
            diner_id: dinerId,
          }),
        }
      );
      const data = await resp.json();
      if (data.cards) {
        setStoredCards(data.cards);
        const defaultCard = data.cards.find((c: StoredCard) => c.is_default);
        if (defaultCard) setSelectedStoredCard(defaultCard.token_reference);
      }
    } catch {}
  };

  const deleteStoredCard = async (cardId: string) => {
    if (!dinerId) return;
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "delete_stored_card",
            venue_id: venueId,
            diner_id: dinerId,
            card_id: cardId,
          }),
        }
      );
      setStoredCards((prev) => prev.filter((c) => c.id !== cardId));
      if (storedCards.find((c) => c.id === cardId)?.token_reference === selectedStoredCard) {
        setSelectedStoredCard(null);
      }
      toast.success("Card removed");
    } catch {
      toast.error("Failed to remove card");
    }
  };

  /**
   * Creates an order in the DB and returns its ID + audit date.
   * Shared by Drop-in flow, stored-card flow, and confirm-only flow.
   */
  const createOrderRow = async (opts?: { tabId?: string | null }): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id || null;

    const orderId = crypto.randomUUID();
    const { data: auditDateData } = await supabase.rpc("get_venue_audit_date", { _venue_id: venueId });
    const auditDate = (auditDateData as string | null) || new Date().toISOString().slice(0, 10);

    // Resolve session for group mode
    let sessionIdToStamp: string | null = null;
    if (sessionMode === "group") {
      try {
        const { data: sid, error: sessErr } = await supabase.rpc("find_or_create_table_session", {
          _venue_id: venueId,
          _table_id: tableId,
          _fire_strategy: "wait_for_all",
          _host_diner_id: dinerId,
          _display_name: groupDisplayName || null,
          _join_existing_id: joinedSessionId || null,
        });
        if (!sessErr && sid) sessionIdToStamp = sid as string;
      } catch (e) {
        console.error("find_or_create_table_session failed, falling back to solo:", e);
      }
    }

    const { error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        venue_id: venueId,
        table_id: tableId,
        total: total + tipAmount,
        gratuity_amount: tipAmount,
        audit_date: auditDate,
        status: "received" as const,
        customer_id: authUserId,
        customer_notes: tipAmount > 0 ? `Tip: $${tipAmount.toFixed(2)}` : null,
        session_id: sessionIdToStamp,
        session_mode: sessionIdToStamp ? "group" : "solo",
        tab_id: opts?.tabId ?? null,
        payment_status: opts?.tabId ? "unpaid" : "paid",
      } as any);
    if (orderError) throw orderError;

    // Persist per-line modifiers (snapshot) and notes so the kitchen ticket
    // and receipt are immutable even if a modifier is renamed later.
    // unit_price stays as base price; modifier costs sum at receipt time.
    const orderItems = items.map((item) => ({
      order_id: orderId,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.price,
      modifiers: item.modifiers as any,
      notes: item.notes || null,
      ai_source: item.aiSource ?? null,
      ai_session_id: item.aiSessionId ?? null,
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) throw itemsError;

    return orderId;
  };

  const cleanupOrder = async (orderId: string) => {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
  };

  const finalizePaidOrder = async (orderId: string, isMock = false) => {
    await supabase.from("orders").update({ status: "paid" as any }).eq("id", orderId);
    if (dinerId && !isMock) {
      const taxResult = calculateTaxes(total, venueTaxes);
      await supabase
        .from("diner_visits")
        .insert({
          diner_id: dinerId,
          venue_id: venueId,
          order_id: orderId,
          spend_excl_tax: taxResult.subtotalExTax,
        } as any)
        .maybeSingle();
      // Award H&L OrderNOW Rewards points (group/venue-aware) — fire and forget.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: any = {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loyalty-earn`, {
          method: "POST",
          headers,
          body: JSON.stringify({ order_id: orderId, diner_id: dinerId }),
        }).catch((e) => console.warn("loyalty-earn failed:", e));
      } catch (e) {
        console.warn("loyalty-earn dispatch error:", e);
      }
    }
    if (isMock) {
      toast.warning("Demo order placed — no payment was taken (simulated mode)");
    } else {
      toast.success("Payment successful! 🎉");
    }
    onOrderPlaced(orderId);
  };

  // ---------- Open tab ----------
  const tabsAvailable = !!tabRules?.tabs_enabled;
  const preauthAmount = Number(tabRules?.preauth_amount ?? 0);
  const needsPreauth =
    tabMode === "tab" && !!tabRules?.require_preauth && !tabRules?.open_tab_id && preauthAmount > 0;

  const ensureTab = async (): Promise<string> => {
    const { data, error } = await (supabase as any).rpc("find_or_open_tab", {
      _venue_id: venueId,
      _table_id: tableId,
      _session_id: joinedSessionId || null,
      _diner_id: dinerId || null,
    });
    if (error) throw error;
    return data as string;
  };

  /** Adds this round to the table's tab (no payment taken now). */
  const addRoundToTab = async (tabId: string) => {
    const orderId = await createOrderRow({ tabId });
    toast.success("Added to your tab — pay when you're done");
    onOrderPlaced(orderId);
    return orderId;
  };

  const handleAddToTab = async () => {
    setProcessing(true);
    try {
      const tabId = await ensureTab();
      await addRoundToTab(tabId);
    } catch (e: any) {
      console.error("Add to tab failed", e);
      toast.error(e.message || "Couldn't open a tab here");
    }
    setProcessing(false);
  };

  /** Pre-auth deposit → opens the tab, then adds this round to it. */
  const preauthAndAddToTab = async (
    _result: any,
    tabId: string,
  ) => {
    // The authorised pre-auth row and the tab's preauth_status are written
    // server-side by adyen-payment (reference `preauth_<tabId>`) once Adyen has
    // authorised. The browser used to insert both itself, which meant a diner
    // could fabricate an authorisation that never happened.
    await addRoundToTab(tabId);
  };


  /** Called by Drop-in when the diner submits any payment method (card / Apple Pay / Google Pay) */
  const handleDropinSubmit = async (
    paymentMethod: any,
    browserInfo: any,
    helpers: { resolve: (res: any) => void; reject: (err?: any) => void }
  ) => {
    // Tab mode with a required deposit: authorise the pre-auth, open the tab,
    // then push this round onto the tab (nothing else is charged now).
    if (tabMode === "tab") {
      let tabId: string | null = null;
      try {
        tabId = await ensureTab();
        pendingPaymentRef.current = { kind: "tab", tabId };
        const { data: { session } } = await supabase.auth.getSession();
        const headers: any = {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "create_payment",
              venue_id: venueId,
              amount: preauthAmount,
              currency: "AUD",
              reference: `preauth_${tabId}`,
              return_url: window.location.href,
              payment_method: paymentMethod,
              browser_info: browserInfo,
              shopper_reference: dinerId ? `diner_${dinerId}` : `anon_${Date.now()}`,
              diner_id: dinerId || undefined,
            }),
          }
        );
        const result = await resp.json();
        assertPaymentResult(resp, result);
        helpers.resolve({ resultCode: result.resultCode, action: result.action });
        if (result.resultCode === "Authorised") {
          pendingPaymentRef.current = null;
          await preauthAndAddToTab(result, tabId);
        } else if (!isContinuationResult(result.resultCode)) {
          pendingPaymentRef.current = null;
          toast.error(`Pre-authorisation ${result.resultCode}: ${result.refusalReason || "Please try again"}`);
        }
        // A continuation code leaves pendingPaymentRef set; the 3DS outcome is
        // handled in handleDropinAdditionalDetails.
      } catch (e: any) {
        console.error("Tab pre-auth error", e);
        pendingPaymentRef.current = null;
        helpers.reject();
        toast.error(e.message || "Couldn't open your tab. Please try again.");
      }
      return;
    }

    let orderId: string | null = null;
    try {
      orderId = await createOrderRow();
      pendingPaymentRef.current = { kind: "order", orderId };
      const shopperRef = dinerId ? `diner_${dinerId}` : `anon_${Date.now()}`;

      const { data: { session } } = await supabase.auth.getSession();
      const headers: any = {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "create_payment",
            venue_id: venueId,
            amount: total + tipAmount,
            currency: "AUD",
            reference: `order_${orderId}`,
            return_url: window.location.href,
            payment_method: paymentMethod,
            browser_info: browserInfo,
            shopper_reference: shopperRef,
            store_card: !!(saveCard && dinerId),
            diner_id: dinerId || undefined,
          }),
        }
      );
      const result = await resp.json();

      // Fail closed BEFORE resolving the Drop-in: a non-2xx (rate limit,
      // sanitised server error, relayed upstream rejection) carries no
      // resultCode, and resolving with `undefined` makes the Drop-in show its
      // success screen for a payment that never happened.
      assertPaymentResult(resp, result);

      // Pass result back to Drop-in so it can render success/3DS/error
      helpers.resolve({
        resultCode: result.resultCode,
        action: result.action,
      });

      if (result.resultCode === "Authorised") {
        pendingPaymentRef.current = null;
        await finalizePaidOrder(orderId, !!result?.mock_mode);
      } else if (!isContinuationResult(result.resultCode)) {
        // Anything that is not an authorisation and not a Drop-in continuation
        // (3DS challenge / redirect) is a failure. Treating only Refused, Error
        // and Cancelled as failures left every other code silently paid.
        pendingPaymentRef.current = null;
        toast.error(`Payment ${result.resultCode}: ${result.refusalReason || "Please try again"}`);
        await cleanupOrder(orderId);
      }
      // For RedirectShopper / IdentifyShopper / ChallengeShopper the Drop-in
      // handles the next step itself; we'll get the final result via
      // onAdditionalDetails, which reads pendingPaymentRef to finalise or clean up.
    } catch (e: any) {
      console.error("Drop-in submit error:", e);
      pendingPaymentRef.current = null;
      helpers.reject();
      if (orderId) await cleanupOrder(orderId);
      toast.error("Payment failed. Please try again.");
    }
  };

  const handleDropinAdditionalDetails = async (
    details: any,
    helpers: { resolve: (res: any) => void; reject: (err?: any) => void }
  ) => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "payment_details",
            venue_id: venueId,
            details: details.details,
            // `paymentData` correlates this completion with the original
            // /payments call. The Drop-in supplies it alongside `details`, and
            // omitting it means no 3DS challenge or redirect can ever be
            // completed — the diner authenticates and the payment stalls.
            payment_data: details.paymentData,
          }),
        }
      );
      const result = await resp.json();
      // Same fail-closed guard: a failed 3DS details call must not be resolved as
      // a success, which is how the Drop-in reads a missing resultCode.
      assertPaymentResult(resp, result);
      helpers.resolve({ resultCode: result.resultCode, action: result.action });

      // Run the SAME post-authorisation path as the non-3DS branch. Resolving the
      // Drop-in only updates its own UI — without this a 3DS payment was charged
      // at Adyen while the order was never finalised, and a failed challenge left
      // the order behind.
      const pending = pendingPaymentRef.current;
      if (result.resultCode === "Authorised") {
        pendingPaymentRef.current = null;
        if (pending?.kind === "order") {
          await finalizePaidOrder(pending.orderId, !!result?.mock_mode);
        } else if (pending?.kind === "tab") {
          await preauthAndAddToTab(result, pending.tabId);
        }
      } else if (!isContinuationResult(result.resultCode)) {
        pendingPaymentRef.current = null;
        toast.error(`Payment ${result.resultCode}: ${result.refusalReason || "Please try again"}`);
        if (pending?.kind === "order") await cleanupOrder(pending.orderId);
      }
    } catch (e) {
      console.error("Drop-in additional details error:", e);
      const pending = pendingPaymentRef.current;
      pendingPaymentRef.current = null;
      helpers.reject();
      if (pending?.kind === "order") await cleanupOrder(pending.orderId);
      toast.error("Payment could not be completed. Please try again.");
    }
  };

  /** Stored-card / mock-fallback flow (no Drop-in) */
  const processLegacyPayment = async () => {
    // Tab mode: either add straight to the tab, or take the deposit first.
    if (tabMode === "tab") {
      if (!needsPreauth) return handleAddToTab();
      setProcessing(true);
      try {
        const tabId = await ensureTab();
        const shopperRef = dinerId ? `diner_${dinerId}` : `anon_${Date.now()}`;
        const { data: { session } } = await supabase.auth.getSession();
        const headers: any = {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const body: any = {
          action: "create_payment",
          venue_id: venueId,
          amount: preauthAmount,
          currency: "AUD",
          reference: `preauth_${tabId}`,
          return_url: window.location.href,
        };
        if (selectedStoredCard) {
          const storedCard = storedCards.find((c) => c.token_reference === selectedStoredCard);
          body.stored_card_token = selectedStoredCard;
          body.shopper_reference = storedCard?.shopper_reference || shopperRef;
        } else {
          // PAY-01: no raw card data is ever collected in the browser. This branch
          // is reached only in simulated (mock) mode — the backend authorises the
          // simulated pre-auth purely on its mock flag, not on any card number.
          body.shopper_reference = shopperRef;
        }
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
          { method: "POST", headers, body: JSON.stringify(body) }
        );
        const result = await resp.json();
        if (result.resultCode === "Authorised") {
          await preauthAndAddToTab(result, tabId);
        } else {
          toast.error(`Pre-authorisation ${result.resultCode || "failed"}: ${result.refusalReason || "Please try again"}`);
        }
      } catch (e: any) {
        console.error("Tab pre-auth error", e);
        toast.error(e.message || "Couldn't open your tab. Please try again.");
      }
      setProcessing(false);
      return;
    }

    setProcessing(true);
    let orderId: string | null = null;
    try {
      orderId = await createOrderRow();

      if (paymentEnabled) {
        const shopperRef = dinerId ? `diner_${dinerId}` : `anon_${Date.now()}`;
        const { data: { session } } = await supabase.auth.getSession();
        const headers: any = {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

        const paymentBody: any = {
          action: "create_payment",
          venue_id: venueId,
          amount: total + tipAmount,
          currency: "AUD",
          reference: `order_${orderId}`,
          return_url: window.location.href,
        };

        if (selectedStoredCard) {
          const storedCard = storedCards.find((c) => c.token_reference === selectedStoredCard);
          paymentBody.stored_card_token = selectedStoredCard;
          paymentBody.shopper_reference = storedCard?.shopper_reference || shopperRef;
        } else {
          // PAY-01: no raw card data is ever collected in the browser. This branch
          // is reached only in simulated (mock) mode — the backend authorises the
          // simulated payment purely on its mock flag, not on any card number.
          paymentBody.shopper_reference = shopperRef;
        }

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
          { method: "POST", headers, body: JSON.stringify(paymentBody) }
        );
        const result = await resp.json();

        if (result.resultCode === "Authorised") {
          await finalizePaidOrder(orderId, !!result?.mock_mode);
        } else {
          const hint = result?.mock_mode
            ? "Simulated payment could not be completed. Please try again."
            : "Please try again or use a different payment method.";
          toast.error(
            `Payment ${result.resultCode || "failed"}: ${result.refusalReason || hint}`
          );
          await cleanupOrder(orderId);
        }
      } else {
        if (dinerId) {
          const taxResult = calculateTaxes(total, venueTaxes);
          await supabase
            .from("diner_visits")
            .insert({
              diner_id: dinerId,
              venue_id: venueId,
              order_id: orderId,
              spend_excl_tax: taxResult.subtotalExTax,
            } as any)
            .maybeSingle();
        }
        toast.success("Order placed! 🎉");
        onOrderPlaced(orderId);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      if (orderId) await cleanupOrder(orderId);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  // In tab mode we only show payment UI when a deposit (pre-auth) is required.
  const paymentUiNeeded = tabMode === "pay_now" || needsPreauth;

  // Show Drop-in only when payments enabled, no stored card selected, we have methods + key,
  // and we're NOT in mock mode.
  const showDropin =
    paymentUiNeeded &&
    paymentEnabled && !selectedStoredCard && !!paymentMethodsResponse && !!shyndigPayClientKey && !isMockMode;

  // PAY-01: mock/simulated mode collects NO card data — the diner just taps the
  // footer button and the backend authorises on its mock flag.
  const showMockPay =
    paymentUiNeeded && paymentEnabled && isMockMode && !selectedStoredCard;

  // PAY-01: when the hosted Drop-in cannot load in a real (non-mock) venue we must
  // NOT fall back to a raw card form — show an unavailable message instead.
  const showPaymentUnavailable =
    paymentUiNeeded &&
    paymentEnabled && !isMockMode && !showDropin && !selectedStoredCard && !loadingMethods;

  // The footer button can only complete payment via a stored card or a mock
  // simulate. Adding a round to a tab needs no authorisation up front, but a
  // required deposit does — so an unavailable Drop-in blocks opening the tab.
  const canProceedLegacy = !paymentEnabled
    ? true
    : tabMode === "tab" && !needsPreauth
      ? true
      : !!selectedStoredCard || showMockPay;

  if (showTabBill && tabRules?.open_tab_id) {
    return (
      <TabBillPanel
        venueId={venueId}
        tabId={tabRules.open_tab_id}
        dinerId={dinerId}
        allowSplit={tabRules.allow_split_payments !== false}
        onBack={() => setShowTabBill(false)}
        onSettled={() => {
          setShowTabBill(false);
          fetchTabRules();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] pb-32">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 sticky top-0 z-30 bg-background">
        <button onClick={onBack} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold">Checkout</h2>
          <p className="text-muted-foreground text-sm">
            {items.length} item{items.length !== 1 ? "s" : ""} — ${total.toFixed(2)}
          </p>
        </div>
      </div>

      {sessionMode === "group" && (
        <div className="mx-5 mb-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          Group order{groupDisplayName ? ` · ${groupDisplayName}` : ""} — kitchen holds your bundle until everyone's ready (or ~90s after your last order).
        </div>
      )}

      {/* Pay now vs run a tab — only in areas where the venue allows tabs */}
      {tabsAvailable && (
        <div className="mx-5 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTabMode("pay_now")}
              className={`rounded-xl border p-3 text-left transition-colors ${
                tabMode === "pay_now" ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <span className="block text-sm font-semibold">Pay now</span>
              <span className="block text-[11px] text-muted-foreground">Settle this round</span>
            </button>
            <button
              onClick={() => setTabMode("tab")}
              className={`rounded-xl border p-3 text-left transition-colors ${
                tabMode === "tab" ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <span className="block text-sm font-semibold flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" /> Put it on a tab
              </span>
              <span className="block text-[11px] text-muted-foreground">Pay at the end</span>
            </button>
          </div>

          {tabMode === "tab" && (
            <p className="text-xs text-muted-foreground">
              {needsPreauth
                ? `A ${money(preauthAmount)} deposit is held on your card to open the tab — it comes off your final bill.`
                : tabRules?.open_tab_id
                ? "This round joins the tab already open on your table."
                : "Order as many rounds as you like, then settle the whole bill in the app."}
              {tabRules?.max_tab_amount
                ? ` Tab limit ${money(tabRules.max_tab_amount)}.`
                : ""}
            </p>
          )}

          {tabRules?.open_tab_id && (
            <button
              onClick={() => setShowTabBill(true)}
              className="w-full rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary"
            >
              View tab &amp; pay
            </button>
          )}
        </div>
      )}


      <div className="flex-1 px-5 pb-4 space-y-5">
        {/* Order Summary */}
        <div className="space-y-2">
          {items.map((item) => {
            const perUnit = lineUnitPrice(item);
            const paidMods = item.modifiers.filter((m) => Number(m.price) > 0);
            return (
              <div key={item.id} className="space-y-0.5">
                <div className="flex justify-between text-sm">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span className="font-medium">${(perUnit * item.quantity).toFixed(2)}</span>
                </div>
                {paidMods.map((m) => (
                  <div key={m.modifier_id} className="flex justify-between text-[11px] text-muted-foreground pl-4">
                    <span>+ {m.name}</span>
                    <span>+${(m.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {(() => {
            const taxResult = calculateTaxes(total, venueTaxes);
            const hasExclusive = venueTaxes.some((t) => !t.is_inclusive);
            return (
              <>
                <Separator />
                {taxResult.lines.map((line, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span>{line.name} ({line.is_inclusive ? "incl." : "added"})</span>
                    <span>${line.amount.toFixed(2)}</span>
                  </div>
                ))}
                {venueTaxes.length > 0 && taxResult.lines.some((l) => l.is_inclusive) && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal (ex-tax)</span>
                    <span>${taxResult.subtotalExTax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total{hasExclusive ? " (incl. tax)" : ""}</span>
                  <span>${taxResult.grandTotal.toFixed(2)}</span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Gratuity Prompt */}
        {gratuityEnabled && (
          <div className="space-y-3">
            <Separator />
            <p className="text-sm font-semibold text-center">{gratuityPrompt}</p>
            <div className="grid grid-cols-3 gap-2">
              {gratuityOptions.map((opt, i) => {
                const tipVal = parseFloat((total * opt.percent / 100).toFixed(2));
                const isSelected = selectedTip === tipVal;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedTip(isSelected ? null : tipVal)}
                    className={`rounded-xl border p-3 text-center transition-colors ${
                      isSelected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground">{opt.percent}%</span>
                    <span className="block text-sm font-medium mt-1">${tipVal.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSelectedTip(null)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
            >
              {gratuityDecline}
            </button>
            {selectedTip !== null && selectedTip > 0 && (
              <div className="flex justify-between text-sm font-medium">
                <span>Tip</span>
                <span>${selectedTip.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {paymentEnabled === false && (
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Payments will be collected at the venue. Tap below to confirm your order.
            </p>
          </div>
        )}

        {tabMode === "tab" && !needsPreauth && paymentEnabled && (
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No payment now — this round goes on your tab. Settle the whole bill from "View tab
              &amp; pay" whenever you're ready.
            </p>
          </div>
        )}

        {paymentEnabled && paymentUiNeeded && (
          <>
            <Separator />

            {isMockMode && (
              <div className="rounded-xl border-2 border-warning bg-warning/15 px-4 py-3 text-sm">
                <p className="font-bold text-warning-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Simulated payment mode
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This venue isn't fully connected to the payment processor yet, so no card will
                  actually be charged. Tap the button below to place a simulated order. Card and
                  wallet payments are disabled in this mode.
                </p>
              </div>
            )}

            {/* Stored Cards (signed-in diners) — render above Drop-in */}
            {storedCards.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Your H&L OrderNOW wallet</Label>
                  <p className="text-[11px] text-muted-foreground">Cards you've saved travel with your H&L OrderNOW ID — usable at every H&L OrderNOW venue.</p>
                </div>
                {storedCards.map((sc) => (
                  <div
                    key={sc.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      selectedStoredCard === sc.token_reference
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                    onClick={() => {
                      setSelectedStoredCard(
                        selectedStoredCard === sc.token_reference ? null : sc.token_reference
                      );
                    }}
                  >
                    <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {sc.card_brand || "Card"} •••• {sc.card_summary || "****"}
                      </p>
                      {sc.expiry_month && sc.expiry_year && (
                        <p className="text-xs text-muted-foreground">
                          Expires {sc.expiry_month}/{sc.expiry_year}
                        </p>
                      )}
                    </div>
                    {selectedStoredCard === sc.token_reference && (
                      <Check className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStoredCard(sc.id);
                      }}
                      className="p-1 text-destructive/60 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {!selectedStoredCard && (
                  <p className="text-xs text-muted-foreground text-center">
                    Or pay a different way below
                  </p>
                )}
              </div>
            )}

            {/* H&L Pay Drop-in — Apple Pay / Google Pay / hosted card */}
            {showDropin && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {needsPreauth ? `Pre-authorise ${money(preauthAmount)} to open your tab` : "Pay with card or wallet"}
                </Label>
                {dinerId && (
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                    <div>
                      <p className="text-sm font-medium">Save card for next time</p>
                      <p className="text-xs text-muted-foreground">
                        Securely stored by H&L Pay — we never see your full card number
                      </p>
                    </div>
                    <Switch checked={saveCard} onCheckedChange={setSaveCard} />
                  </div>
                )}
                <ShyndigPayDropin
                  paymentMethodsResponse={paymentMethodsResponse}
                  amount={needsPreauth ? preauthAmount : total + tipAmount}
                  currency="AUD"
                  countryCode="AU"
                  environment={paymentEnvironment}
                  clientKey={shyndigPayClientKey || undefined}
                  merchantName="H&L Pay"
                  applePayMerchantId={walletConfig?.applePayMerchantId || undefined}
                  googlePayMerchantId={walletConfig?.googlePayMerchantId || undefined}
                  gatewayMerchantId={walletConfig?.gatewayMerchantId || undefined}
                  onSubmit={handleDropinSubmit}
                  onAdditionalDetails={handleDropinAdditionalDetails}
                  onError={(e) => {
                    console.error("H&L Pay error:", e);
                  }}
                />
              </div>
            )}

            {/* Loading state */}
            {paymentEnabled && !showDropin && loadingMethods && !selectedStoredCard && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Loading payment methods…
              </p>
            )}

            {/* PAY-01: mock/simulated mode — no card entry. The footer button
                submits a simulated payment. */}
            {showMockPay && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Tap <strong>Pay</strong> below to place a simulated order — no card details are
                collected or charged in test mode.
              </div>
            )}

            {/* PAY-01: real venue where the secure payment form could not load — we
                never fall back to a raw card form. */}
            {showPaymentUnavailable && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                The secure payment form is temporarily unavailable. Please refresh and try again, or
                ask the venue for help — do not enter card details anywhere else.
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Secured by H&L Pay</span>
            </div>
          </>
        )}
      </div>

      {/* Pay Button — only used for stored-card flow, legacy form, and confirm-only flow.
          Drop-in renders its own pay button. Fixed above BottomNav so it's always reachable. */}
      {!showDropin && (
        <div
          className="fixed left-0 right-0 max-w-md mx-auto bg-background border-t border-border px-5 pt-3 z-40"
          style={{ bottom: "4rem", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
        >
          <Button
            onClick={processLegacyPayment}
            disabled={processing || !canProceedLegacy}
            className="w-full h-14 rounded-2xl text-base"
          >
            {processing
              ? "Processing..."
              : tabMode === "tab"
              ? needsPreauth
                ? `Hold ${money(preauthAmount)} & open tab`
                : `Add to tab — ${money(total + tipAmount)}`
              : paymentEnabled
              ? sessionMode === "group"
                ? `Pay & send to table — $${(total + tipAmount).toFixed(2)}`
                : `Pay $${(total + tipAmount).toFixed(2)}`
              : sessionMode === "group"
              ? `Send to table — $${(total + tipAmount).toFixed(2)}`
              : `Confirm Order — $${(total + tipAmount).toFixed(2)}`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CheckoutPanel;
