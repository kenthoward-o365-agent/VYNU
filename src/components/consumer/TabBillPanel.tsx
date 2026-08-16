import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Receipt, ShieldCheck, Gift, CreditCard, Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import ShyndigPayDropin from "./AdyenDropin";
import { assertPaymentResult, isContinuationResult } from "@/lib/payment-result";
import {
  money,
  splitEvenly,
  TAB_PAYMENT_METHOD_LABELS,
  type TabSummary,
} from "@/lib/tabs";

interface TabBillPanelProps {
  venueId: string;
  tabId: string;
  dinerId: string | null;
  dinerName?: string | null;
  allowSplit?: boolean;
  onBack: () => void;
  onSettled?: () => void;
}

type PayMode = "card" | "gift_card" | "voucher";

const TabBillPanel = ({
  venueId,
  tabId,
  dinerId,
  dinerName = null,
  allowSplit = true,
  onBack,
  onSettled,
}: TabBillPanelProps) => {
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [splitParts, setSplitParts] = useState(1);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("card");
  const [voucherCode, setVoucherCode] = useState("");
  const [methodsResponse, setMethodsResponse] = useState<any>(null);
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);
  // PAY-07: the Drop-in must initialise in the SAME environment the server
  // processes against, so take it from the payment_methods response rather than
  // assuming test.
  const [paymentEnvironment, setPaymentEnvironment] = useState<"test" | "live">("test");
  // PAY-05: per-venue wallet identifiers; a wallet is only offered when its real
  // id is present.
  const [walletConfig, setWalletConfig] = useState<{
    applePayMerchantId?: string | null;
    googlePayMerchantId?: string | null;
    gatewayMerchantId?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Amount of a tab payment that is mid-3DS, so the outcome callback can settle it. */
  const pendingTabPaymentRef = useRef<number | null>(null);

  const balance = summary?.balance_due ?? 0;
  const amountToPay = Math.min(
    Number(payAmount) || 0,
    Number((balance || 0).toFixed(2))
  );

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("get_tab_summary", { _tab_id: tabId });
    if (error) {
      console.error("get_tab_summary failed", error);
      toast.error("Couldn't load your tab");
      setLoading(false);
      return;
    }
    const s = data as TabSummary;
    setSummary(s);
    setPayAmount((prev) => (prev === "" ? (s?.balance_due ?? 0).toFixed(2) : prev));
    setLoading(false);
  }, [tabId]);

  useEffect(() => {
    load();
  }, [load]);

  // Load VYNU Pay methods for the amount being paid
  useEffect(() => {
    if (amountToPay <= 0) return;
    let cancelled = false;
    (async () => {
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
              amount: amountToPay,
              currency: "AUD",
              country_code: "AU",
              shopper_reference: dinerId ? `diner_${dinerId}` : undefined,
            }),
          }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (data?.paymentMethods) setMethodsResponse(data);
        setClientKey(data?.client_key || null);
        setIsMockMode(!!data?.mock_mode);
        setPaymentEnvironment(data?.environment === "live" ? "live" : "test");
        setWalletConfig(data?.wallets || null);
      } catch (e) {
        console.error("Failed to load payment methods", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, Math.round(amountToPay * 100)]);

  /**
   * Lodge a gift card / voucher for staff to apply at the bar.
   *
   * This is the only payment row the diner app is allowed to write, and it is
   * always 'pending' — pending rows do not count toward balance_due, so they
   * cannot settle a tab on their own. Card payments are recorded server-side by
   * adyen-payment once the PSP has authorised; the browser never asserts that
   * money moved. Enforced by RLS and by enforce_tab_payment_authority().
   */
  const lodgeVoucherForStaff = async (row: {
    method: string;
    amount: number;
    reference_label: string;
  }) => {
    const { error } = await supabase.from("tab_payments").insert({
      tab_id: tabId,
      venue_id: venueId,
      method: row.method,
      amount: row.amount,
      status: "pending",
      reference_label: row.reference_label,
      payer_diner_id: dinerId,
      payer_label: dinerName || null,
    } as any);
    if (error) throw error;
  };

  const trySettle = async () => {
    const { data } = await (supabase as any).rpc("settle_tab", { _tab_id: tabId });
    if ((data as any)?.settled) {
      toast.success("Tab settled — thanks! 🎉");
      onSettled?.();
      return true;
    }
    return false;
  };

  /**
   * Post-authorisation path for a tab payment. Shared by the direct branch and the
   * 3DS branch: when Adyen returns a continuation code the outcome arrives later in
   * handleDropinAdditionalDetails, which previously resolved the Drop-in and did
   * nothing else — so a 3DS tab payment settled at Adyen while the tab UI never
   * updated. `paidAmount` is captured at submit time because amountToPay is
   * derived from an input the diner could change during the challenge.
   */
  const applyTabPaymentSuccess = async (paidAmount: number) => {
    // The payment row is written server-side by adyen-payment once Adyen has
    // authorised, so the browser never asserts that money moved.
    toast.success(`${money(paidAmount)} paid off your tab`);
    const settled = await trySettle();
    if (!settled) {
      setPayAmount("");
      await load();
    }
  };

  const handleDropinSubmit = async (
    paymentMethod: any,
    browserInfo: any,
    helpers: { resolve: (r: any) => void; reject: (e?: any) => void }
  ) => {
    // Amount for this attempt, held across a possible 3DS challenge.
    const paidAmount = amountToPay;
    pendingTabPaymentRef.current = paidAmount;
    try {
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
            amount: amountToPay,
            currency: "AUD",
            reference: `tab_${tabId}_${Date.now()}`,
            return_url: window.location.href,
            payment_method: paymentMethod,
            browser_info: browserInfo,
            shopper_reference: dinerId ? `diner_${dinerId}` : `anon_${Date.now()}`,
            diner_id: dinerId || undefined,
          }),
        }
      );
      const result = await resp.json();
      // Fail closed before resolving: a non-2xx response carries no resultCode,
      // and resolving the Drop-in with `undefined` makes it render success.
      assertPaymentResult(resp, result);
      helpers.resolve({ resultCode: result.resultCode, action: result.action });

      if (result.resultCode === "Authorised") {
        pendingTabPaymentRef.current = null;
        await applyTabPaymentSuccess(paidAmount);
      } else if (!isContinuationResult(result.resultCode)) {
        pendingTabPaymentRef.current = null;
        toast.error(`Payment ${result.resultCode}: ${result.refusalReason || "Please try again"}`);
      }
      // A continuation code leaves pendingTabPaymentRef set; the 3DS outcome is
      // handled in handleDropinAdditionalDetails.
    } catch (e) {
      console.error("Tab payment error", e);
      pendingTabPaymentRef.current = null;
      helpers.reject();
      toast.error("Payment failed. Please try again.");
    }
  };

  const handleDropinAdditionalDetails = async (
    details: any,
    helpers: { resolve: (r: any) => void; reject: (e?: any) => void }
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
            // Required to correlate a 3DS challenge/redirect with the original
            // /payments call; without it the challenge can never complete.
            payment_data: details.paymentData,
          }),
        }
      );
      const result = await resp.json();
      assertPaymentResult(resp, result);
      helpers.resolve({ resultCode: result.resultCode, action: result.action });

      // Same post-authorisation path as the direct branch — resolving the Drop-in
      // alone would leave the tab balance stale after a 3DS challenge.
      const paidAmount = pendingTabPaymentRef.current;
      if (result.resultCode === "Authorised") {
        pendingTabPaymentRef.current = null;
        await applyTabPaymentSuccess(paidAmount ?? amountToPay);
      } else if (!isContinuationResult(result.resultCode)) {
        pendingTabPaymentRef.current = null;
        toast.error(`Payment ${result.resultCode}: ${result.refusalReason || "Please try again"}`);
      }
    } catch (e) {
      console.error("Tab additional details error", e);
      pendingTabPaymentRef.current = null;
      helpers.reject();
      toast.error("Payment could not be completed. Please try again.");
    }
  };

  const submitVoucher = async () => {
    if (amountToPay <= 0) return toast.error("Enter an amount");
    if (!voucherCode.trim()) return toast.error("Enter the card or voucher number");
    setBusy(true);
    try {
      await lodgeVoucherForStaff({
        method: payMode,
        amount: amountToPay,
        reference_label: voucherCode.trim(),
      });
      toast.success("Sent to staff to apply — they'll confirm at the bar");
      setVoucherCode("");
      setPayAmount("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Couldn't add that");
    }
    setBusy(false);
  };

  const askStaffToClose = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("table_tabs")
      .update({ status: "closing" } as any)
      .eq("id", tabId);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Staff have been asked to close your tab");
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-4rem)] items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading your tab…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-4rem)] items-center justify-center gap-3 px-6">
        <p className="text-muted-foreground text-sm">We couldn't find this tab.</p>
        <Button variant="outline" onClick={onBack}>Go back</Button>
      </div>
    );
  }

  const perPerson = splitEvenly(balance, splitParts)[0];
  const showDropin = payMode === "card" && !!methodsResponse && !!clientKey && !isMockMode && amountToPay > 0;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] pb-32">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 sticky top-0 z-30 bg-background">
        <button onClick={onBack} className="p-1" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Your tab
          </h2>
          <p className="text-muted-foreground text-sm">
            {summary.orders.length} round{summary.orders.length === 1 ? "" : "s"} · balance{" "}
            {money(balance)}
          </p>
        </div>
        <button onClick={load} className="p-1 text-muted-foreground" aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 px-5 space-y-5">
        {/* Rounds */}
        <div className="space-y-2">
          {summary.orders.map((o, i) => (
            <div key={o.id} className="flex justify-between text-sm">
              <span>
                Round {i + 1}{" "}
                <span className="text-muted-foreground text-xs">
                  {new Date(o.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
              <span className="font-medium">{money(o.total)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between text-sm">
            <span>Total ordered</span>
            <span className="font-medium">{money(summary.total_ordered)}</span>
          </div>

          {summary.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-xs text-muted-foreground">
              <span>
                {TAB_PAYMENT_METHOD_LABELS[p.method] || p.method}
                {p.payer_label ? ` · ${p.payer_label}` : ""}
                {p.status === "pending" ? " (awaiting staff)" : ""}
                {p.status === "authorised" ? " (pre-auth held)" : ""}
              </span>
              <span>−{money(p.amount)}</span>
            </div>
          ))}

          <Separator />
          <div className="flex justify-between font-semibold text-base">
            <span>Balance due</span>
            <span>{money(balance)}</span>
          </div>
        </div>

        {balance <= 0 ? (
          <div className="rounded-xl bg-muted p-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Your tab is fully covered.</p>
            <Button className="w-full h-12 rounded-2xl" onClick={trySettle}>
              Close my tab
            </Button>
          </div>
        ) : (
          <>
            {allowSplit && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Splitting the bill?
                </Label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setSplitParts(n);
                        setPayAmount(splitEvenly(balance, n)[0].toFixed(2));
                      }}
                      className={`rounded-xl border py-2 text-sm transition-colors ${
                        splitParts === n ? "border-primary bg-primary/10" : "border-border bg-card"
                      }`}
                    >
                      {n === 1 ? "All" : `÷${n}`}
                    </button>
                  ))}
                </div>
                {splitParts > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {money(perPerson)} each — everyone pays their share from their own phone, or pay
                    a few shares here.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Amount to pay now</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">Max {money(balance)}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Pay with</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "card", label: "Card / wallet", icon: CreditCard },
                  { id: "gift_card", label: "Gift card", icon: Gift },
                  { id: "voucher", label: "Voucher", icon: Gift },
                ] as const).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPayMode(m.id)}
                    className={`rounded-xl border p-3 text-center text-xs font-medium transition-colors ${
                      payMode === m.id ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <m.icon className="h-4 w-4 mx-auto mb-1" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {payMode === "card" && (
              <div className="space-y-3">
                {showDropin ? (
                  <ShyndigPayDropin
                    paymentMethodsResponse={methodsResponse}
                    amount={amountToPay}
                    currency="AUD"
                    countryCode="AU"
                    environment={paymentEnvironment}
                    clientKey={clientKey || undefined}
                    merchantName="VYNU Pay"
                    applePayMerchantId={walletConfig?.applePayMerchantId || undefined}
                    googlePayMerchantId={walletConfig?.googlePayMerchantId || undefined}
                    gatewayMerchantId={walletConfig?.gatewayMerchantId || undefined}
                    onSubmit={handleDropinSubmit}
                    onAdditionalDetails={handleDropinAdditionalDetails}
                    onError={(e) => console.error("VYNU Pay error:", e)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {amountToPay <= 0
                      ? "Enter an amount to pay."
                      : "Card payment isn't available on this device right now — pay at the bar and staff will close your tab."}
                  </p>
                )}
              </div>
            )}

            {(payMode === "gift_card" || payMode === "voucher") && (
              <div className="space-y-3">
                <Input
                  placeholder={payMode === "gift_card" ? "Gift card number" : "Voucher code"}
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  className="text-base"
                />
                <Button
                  className="w-full h-12 rounded-2xl"
                  disabled={busy || amountToPay <= 0}
                  onClick={submitVoucher}
                >
                  Apply {money(amountToPay)}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Staff confirm gift cards and vouchers at the bar before your tab closes.
                </p>
              </div>
            )}

            <Button variant="outline" className="w-full" disabled={busy} onClick={askStaffToClose}>
              Ask staff to close my tab
            </Button>
          </>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Secured by VYNU Pay</span>
        </div>
      </div>
    </div>
  );
};

export default TabBillPanel;
