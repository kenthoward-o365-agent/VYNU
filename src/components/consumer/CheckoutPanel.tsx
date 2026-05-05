import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateTaxes, type TaxConfig } from "@/lib/tax-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, ArrowLeft, ShieldCheck, Trash2, Check } from "lucide-react";
import ShyndigPayDropin from "./AdyenDropin";

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

  // Legacy raw-card form (used only as fallback in mock mode without an Adyen client key)
  const [card, setCard] = useState({
    number: "",
    expiry_month: "",
    expiry_year: "",
    cvc: "",
    holder_name: "",
  });
  const [saveCard, setSaveCard] = useState(false);
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

  // ShyndigPay Drop-in state
  const [paymentMethodsResponse, setPaymentMethodsResponse] = useState<any>(null);
  const [ordrPayClientKey, setShyndigPayClientKey] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);

  useEffect(() => {
    checkPaymentEnabled();
    fetchVenueTaxes();
    fetchGratuityConfig();
    if (dinerId) fetchStoredCards();
  }, [venueId, dinerId]);

  // Once payments are confirmed enabled and we know the total, fetch Adyen methods for Drop-in
  useEffect(() => {
    if (paymentEnabled && total > 0 && !paymentMethodsResponse && !selectedStoredCard) {
      fetchPaymentMethods();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentEnabled, total + (selectedTip ?? 0)]);

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
    const { data } = await supabase
      .from("venue_taxes" as any)
      .select("id, name, rate, tax_type, is_inclusive, display_order")
      .eq("venue_id", venueId)
      .eq("is_active", true)
      .order("display_order");
    setVenueTaxes((data as any as TaxConfig[]) || []);
  };

  const checkPaymentEnabled = async () => {
    const { data } = await supabase
      .from("venue_payment_config" as any)
      .select("is_active, environment")
      .eq("venue_id", venueId)
      .eq("provider", "ordrpayments")
      .maybeSingle();
    setPaymentEnabled(!!(data as any)?.is_active);
    setPaymentEnvironment(((data as any)?.environment as "test" | "live") || "test");
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
      // Read client key returned by the ShyndigPay backend (per-venue)
      const key = data?.client_key || (import.meta as any).env?.VITE_ADYEN_CLIENT_KEY || null;
      setShyndigPayClientKey(key);
      setIsMockMode(!!data?.mock_mode);
    } catch (e) {
      console.error("Failed to load payment methods:", e);
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
  const createOrderRow = async (): Promise<string> => {
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
      // Award Shyndig Rewards points (group/venue-aware) — fire and forget.
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

  /** Called by Drop-in when the diner submits any payment method (card / Apple Pay / Google Pay) */
  const handleDropinSubmit = async (
    paymentMethod: any,
    browserInfo: any,
    helpers: { resolve: (res: any) => void; reject: (err?: any) => void }
  ) => {
    let orderId: string | null = null;
    try {
      orderId = await createOrderRow();
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

      // Pass result back to Drop-in so it can render success/3DS/error
      helpers.resolve({
        resultCode: result.resultCode,
        action: result.action,
      });

      if (result.resultCode === "Authorised") {
        await finalizePaidOrder(orderId, !!result?.mock_mode);
      } else if (
        result.resultCode === "Refused" ||
        result.resultCode === "Error" ||
        result.resultCode === "Cancelled"
      ) {
        toast.error(`Payment ${result.resultCode}: ${result.refusalReason || "Please try again"}`);
        await cleanupOrder(orderId);
      }
      // For RedirectShopper / IdentifyShopper / ChallengeShopper the Drop-in
      // handles the next step itself; we'll get the final result via onAdditionalDetails.
    } catch (e: any) {
      console.error("Drop-in submit error:", e);
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
          }),
        }
      );
      const result = await resp.json();
      helpers.resolve({ resultCode: result.resultCode, action: result.action });
    } catch (e) {
      helpers.reject();
    }
  };

  /** Stored-card / mock-fallback flow (no Drop-in) */
  const processLegacyPayment = async () => {
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
          paymentBody.card = card;
          paymentBody.shopper_reference = shopperRef;
          if (saveCard && dinerId) {
            paymentBody.store_card = true;
            paymentBody.diner_id = dinerId;
          }
        }

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
          { method: "POST", headers, body: JSON.stringify(paymentBody) }
        );
        const result = await resp.json();

        if (result.resultCode === "Authorised") {
          await finalizePaidOrder(orderId, !!result?.mock_mode);
        } else {
          toast.error(`Payment ${result.resultCode || "failed"}: ${result.refusalReason || "Please try again"}`);
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

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})/g, "$1 ").trim();
  };

  const isLegacyCardValid =
    selectedStoredCard ||
    (card.number.replace(/\s/g, "").length >= 15 &&
      card.expiry_month &&
      card.expiry_year &&
      card.cvc.length >= 3);

  // Show Drop-in only when payments enabled, no stored card selected, we have methods + key,
  // and we're NOT in mock mode (mock mode falls back to the legacy test-card form).
  const showDropin =
    paymentEnabled && !selectedStoredCard && !!paymentMethodsResponse && !!ordrPayClientKey && !isMockMode;

  // Show legacy form whenever Drop-in can't render (no client key / mock mode)
  const showLegacyForm =
    paymentEnabled && !showDropin;

  const canProceedLegacy = paymentEnabled ? isLegacyCardValid : true;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
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

      <div className="flex-1 overflow-auto px-5 pb-4 space-y-5">
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

        {paymentEnabled && (
          <>
            <Separator />

            {isMockMode && (
              <div className="rounded-xl border-2 border-warning bg-warning/15 px-4 py-3 text-sm">
                <p className="font-bold text-warning-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Simulated payment mode
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This venue isn't fully connected to the payment processor yet, so no card will
                  actually be charged. Use test card <code className="font-mono">4111 1111 1111 1111</code> to
                  simulate a successful order. Wallet payments are disabled in this mode.
                </p>
              </div>
            )}

            {/* Stored Cards (signed-in diners) — render above Drop-in */}
            {storedCards.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Your Shyndig wallet</Label>
                  <p className="text-[11px] text-muted-foreground">Cards you've saved travel with your Shyndig ID — usable at every Shyndig venue.</p>
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

            {/* ShyndigPay Drop-in — Apple Pay / Google Pay / hosted card */}
            {showDropin && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Pay with card or wallet
                </Label>
                <ShyndigPayDropin
                  paymentMethodsResponse={paymentMethodsResponse}
                  amount={total + tipAmount}
                  currency="AUD"
                  countryCode="AU"
                  environment={paymentEnvironment}
                  clientKey={ordrPayClientKey || undefined}
                  merchantName="ShyndigPay"
                  onSubmit={handleDropinSubmit}
                  onAdditionalDetails={handleDropinAdditionalDetails}
                  onError={(e) => {
                    console.error("ShyndigPay error:", e);
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

            {/* Legacy raw card form — fallback when Drop-in can't render (no client key) */}
            {showLegacyForm && !selectedStoredCard && (
              <div className="space-y-4">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Card Details
                </Label>
                {isMockMode && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning-foreground">
                    <strong>ShyndigPay test mode.</strong> Use card{" "}
                    <code className="font-mono">4111 1111 1111 1111</code>, any future expiry, any CVC.
                  </div>
                )}

                <div>
                  <Input
                    placeholder="Card number"
                    value={card.number}
                    onChange={(e) =>
                      setCard((c) => ({ ...c, number: formatCardNumber(e.target.value) }))
                    }
                    inputMode="numeric"
                    maxLength={19}
                    className="text-base"
                  />
                </div>

                <div>
                  <Input
                    placeholder="Cardholder name"
                    value={card.holder_name}
                    onChange={(e) =>
                      setCard((c) => ({ ...c, holder_name: e.target.value }))
                    }
                    className="text-base"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="MM"
                    value={card.expiry_month}
                    onChange={(e) =>
                      setCard((c) => ({
                        ...c,
                        expiry_month: e.target.value.replace(/\D/g, "").slice(0, 2),
                      }))
                    }
                    inputMode="numeric"
                    maxLength={2}
                  />
                  <Input
                    placeholder="YYYY"
                    value={card.expiry_year}
                    onChange={(e) =>
                      setCard((c) => ({
                        ...c,
                        expiry_year: e.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                    inputMode="numeric"
                    maxLength={4}
                  />
                  <Input
                    placeholder="CVC"
                    value={card.cvc}
                    onChange={(e) =>
                      setCard((c) => ({
                        ...c,
                        cvc: e.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                    inputMode="numeric"
                    maxLength={4}
                    type="password"
                  />
                </div>

                {dinerId && !isMockMode && (
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                    <div>
                      <p className="text-sm font-medium">Save card for next time</p>
                      <p className="text-xs text-muted-foreground">
                        Securely stored by ShyndigPay — we never see your full card number
                      </p>
                    </div>
                    <Switch checked={saveCard} onCheckedChange={setSaveCard} />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Secured by ShyndigPay</span>
            </div>
          </>
        )}
      </div>

      {/* Pay Button — only used for stored-card flow, legacy form, and confirm-only flow.
          Drop-in renders its own pay button. */}
      {!showDropin && (
        <div className="border-t border-border px-5 pt-4 pb-20">
          <Button
            onClick={processLegacyPayment}
            disabled={processing || !canProceedLegacy}
            className="w-full h-14 rounded-2xl text-base"
          >
            {processing
              ? "Processing..."
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
