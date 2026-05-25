import { useEffect, useRef, useState } from "react";
import { AdyenCheckout, Dropin, Card, ApplePay, GooglePay } from "@adyen/adyen-web";
import "@adyen/adyen-web/styles/adyen.css";

interface AdyenDropinProps {
  /** Raw Adyen /paymentMethods response from the edge function */
  paymentMethodsResponse: any;
  amount: number;
  currency: string;
  /** Adyen merchant id used for Apple/Google Pay merchant identification (optional) */
  merchantName?: string;
  countryCode?: string;
  environment?: "test" | "live";
  clientKey?: string;
  /** Called when Drop-in submits a payment — must call resolve/reject from result */
  onSubmit: (
    paymentMethod: any,
    browserInfo: any,
    helpers: { resolve: (res: any) => void; reject: (err?: any) => void }
  ) => Promise<void> | void;
  onAdditionalDetails: (
    details: any,
    helpers: { resolve: (res: any) => void; reject: (err?: any) => void }
  ) => Promise<void> | void;
  onPaymentCompleted?: (result: any) => void;
  onError?: (err: any) => void;
}

/**
 * Mounts a H&L Pay payment Drop-in instance.
 * - Renders Apple Pay / Google Pay buttons natively when supported
 * - Falls back to a hosted (PCI SAQ A) card form
 */
export default function ShyndigPayDropin({
  paymentMethodsResponse,
  amount,
  currency,
  merchantName = "H&L Pay",
  countryCode = "AU",
  environment = "test",
  clientKey,
  onSubmit,
  onAdditionalDetails,
  onPaymentCompleted,
  onError,
}: AdyenDropinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropinRef = useRef<Dropin | null>(null);
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!containerRef.current) return;

      try {
        // PCI DSS SAQ A: never accept raw card input outside the hosted Drop-in.
        // In LIVE mode, missing client key = hard fail (no fallback form).
        // In TEST + DEV builds only, show a message; raw-card fallback is forbidden in production bundles.
        if (!clientKey) {
          if (environment === "live") {
            setMountError(
              "Payment form unavailable. Please contact the venue — do not enter card details here."
            );
            return;
          }
          setMountError(
            "Payments are in test mode — configure a client key to load the secure card form."
          );
          return;
        }

        const checkout = await AdyenCheckout({
          environment,
          clientKey,
          paymentMethodsResponse,
          locale: "en-AU",
          countryCode,
          amount: {
            value: Math.round(amount * 100),
            currency,
          },
          analytics: { enabled: false },
          onSubmit: (state: any, _component: any, actions: any) => {
            onSubmit(state.data.paymentMethod, state.data.browserInfo, {
              resolve: (res: any) => actions.resolve(res),
              reject: (err?: any) => actions.reject(err),
            });
          },
          onAdditionalDetails: (state: any, _component: any, actions: any) => {
            onAdditionalDetails(state.data, {
              resolve: (res: any) => actions.resolve(res),
              reject: (err?: any) => actions.reject(err),
            });
          },
          onPaymentCompleted: (result: any) => {
            onPaymentCompleted?.(result);
          },
          onError: (error: any) => {
            console.error("[H&L Pay Drop-in] error:", error);
            onError?.(error);
          },
        });

        if (cancelled) return;

        const dropin = new Dropin(checkout, {
          paymentMethodComponents: [Card, ApplePay, GooglePay],
          paymentMethodsConfiguration: {
            card: {
              hasHolderName: true,
              holderNameRequired: true,
              billingAddressRequired: false,
            },
            applepay: {
              amount: { value: Math.round(amount * 100), currency },
              configuration: { merchantName, merchantId: "merchant.com.ordrpayments" },
            },
            googlepay: {
              amount: { value: Math.round(amount * 100), currency },
              countryCode,
              configuration: {
                merchantName,
                merchantId: "BCR2DN4T...",
                gatewayMerchantId: "ShyndigPaymentsAU",
              },
            },
          },
        });

        dropin.mount(containerRef.current);
        dropinRef.current = dropin;
      } catch (e: any) {
        console.error("[H&L Pay Drop-in] mount failed:", e);
        setMountError(e?.message || "Failed to load payment form");
      }
    }

    mount();

    return () => {
      cancelled = true;
      try {
        dropinRef.current?.unmount();
      } catch {}
      dropinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethodsResponse, clientKey, environment]);

  if (mountError) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        {mountError}
      </div>
    );
  }

  return <div ref={containerRef} className="adyen-dropin-container" />;
}
