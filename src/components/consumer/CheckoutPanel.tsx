import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, ArrowLeft, ShieldCheck, Trash2, Check } from "lucide-react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
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
  onBack: () => void;
  onOrderPlaced: (orderId: string) => void;
}

const CheckoutPanel = ({
  items,
  venueId,
  tableId,
  dinerId,
  onBack,
  onOrderPlaced,
}: CheckoutPanelProps) => {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
  const [loadingCards, setLoadingCards] = useState(false);
  const [paymentEnabled, setPaymentEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    checkPaymentEnabled();
    if (dinerId) fetchStoredCards();
  }, [venueId, dinerId]);

  const checkPaymentEnabled = async () => {
    const { data } = await supabase
      .from("venue_payment_config" as any)
      .select("is_active")
      .eq("venue_id", venueId)
      .eq("provider", "adyen")
      .maybeSingle();
    setPaymentEnabled(!!(data as any)?.is_active);
  };

  const fetchStoredCards = async () => {
    if (!dinerId) return;
    setLoadingCards(true);
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
    setLoadingCards(false);
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

  const processPayment = async () => {
    setProcessing(true);
    try {
      // Create the order first — generate ID client-side to avoid needing SELECT permission
      const orderId = crypto.randomUUID();
      const { error: orderError } = await supabase
        .from("orders")
        .insert({
          id: orderId,
          venue_id: venueId,
          table_id: tableId,
          total,
          status: "received" as const,
          customer_id: dinerId,
        });

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      // If payments are enabled, process via Adyen
      if (paymentEnabled) {
        const shopperRef = dinerId ? `diner_${dinerId}` : `anon_${Date.now()}`;
        const headers: any = {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };

        // Add auth header if user is logged in
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          headers.Authorization = `Bearer ${sessionData.session.access_token}`;
        }

        const paymentBody: any = {
          action: "create_payment",
          venue_id: venueId,
          amount: total,
          currency: "AUD",
          reference: `order_${order.id}`,
          return_url: window.location.href,
        };

        if (selectedStoredCard) {
          // Pay with stored card
          const storedCard = storedCards.find((c) => c.token_reference === selectedStoredCard);
          paymentBody.stored_card_token = selectedStoredCard;
          paymentBody.shopper_reference = storedCard?.shopper_reference || shopperRef;
        } else {
          // Pay with new card
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
          // Update order status to paid
          await supabase.from("orders").update({ status: "paid" as any }).eq("id", order.id);
          toast.success("Payment successful! 🎉");
          onOrderPlaced(order.id);
        } else if (result.resultCode === "RedirectShopper") {
          // 3DS redirect
          if (result.action?.url) {
            window.location.href = result.action.url;
          }
          return;
        } else {
          toast.error(`Payment ${result.resultCode || "failed"}: ${result.refusalReason || "Please try again"}`);
          // Clean up the order
          await supabase.from("order_items").delete().eq("order_id", order.id);
          await supabase.from("orders").delete().eq("id", order.id);
        }
      } else {
        // No payment processing, just place the order
        toast.success("Order placed! 🎉");
        onOrderPlaced(order.id);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})/g, "$1 ").trim();
  };

  const isCardValid =
    selectedStoredCard ||
    (card.number.replace(/\s/g, "").length >= 15 &&
      card.expiry_month &&
      card.expiry_year &&
      card.cvc.length >= 3);

  const canProceed = paymentEnabled ? isCardValid : true;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
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

      <div className="flex-1 overflow-auto px-5 pb-4 space-y-5">
        {/* Order Summary */}
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.quantity}× {item.name}
              </span>
              <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

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

            {/* Stored Cards */}
            {storedCards.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Saved Cards</Label>
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
                    Or enter a new card below
                  </p>
                )}
              </div>
            )}

            {/* New Card Form */}
            {!selectedStoredCard && (
              <div className="space-y-4">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Card Details
                </Label>

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

                {/* Save card toggle - only show for signed-in diners */}
                {dinerId && (
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                    <div>
                      <p className="text-sm font-medium">Save card for next time</p>
                      <p className="text-xs text-muted-foreground">
                        Securely stored by Adyen — we never see your full card number
                      </p>
                    </div>
                    <Switch checked={saveCard} onCheckedChange={setSaveCard} />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Payments processed securely by Adyen</span>
            </div>
          </>
        )}
      </div>

      {/* Pay Button */}
      <div className="border-t border-border px-5 pt-4 pb-20">
        <Button
          onClick={processPayment}
          disabled={processing || !canProceed}
          className="w-full h-14 rounded-2xl text-base"
        >
          {processing
            ? "Processing..."
            : paymentEnabled
            ? `Pay $${total.toFixed(2)}`
            : `Confirm Order — $${total.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
};

export default CheckoutPanel;
