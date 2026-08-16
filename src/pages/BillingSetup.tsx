import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

export default function BillingSetup() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const success = searchParams.get("setup") === "success" || window.location.pathname.includes("/success");
  const cancelled = window.location.pathname.includes("/cancelled");

  const [state, setState] = useState<"loading" | "ready" | "error" | "success" | "cancelled">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (success) { setState("success"); return; }
    if (cancelled) { setState("cancelled"); return; }
    if (!token) { setState("error"); setError("Missing token"); return; }

    (async () => {
      const { data, error } = await supabase.functions.invoke("ar-verify-onboarding-token", {
        body: { token },
      });
      if (error || !data?.checkout_url) {
        setState("error");
        setError(error?.message || data?.error || "Invalid or expired link");
        return;
      }
      // Auto-redirect to Stripe
      window.location.href = data.checkout_url;
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {state === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <h1 className="text-xl font-semibold">Preparing secure payment setup…</h1>
              <p className="text-sm text-muted-foreground">
                We're redirecting you to Stripe's secure page to enter your payment details.
              </p>
            </>
          )}
          {state === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <h1 className="text-xl font-semibold">Payment method saved</h1>
              <p className="text-sm text-muted-foreground">
                Your payment details are securely stored. VYNU Pay will use this for your monthly platform invoices.
                You can close this window.
              </p>
            </>
          )}
          {state === "cancelled" && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-amber-500" />
              <h1 className="text-xl font-semibold">Setup cancelled</h1>
              <p className="text-sm text-muted-foreground">
                No payment method was saved. You can click the link in your email again to retry.
              </p>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
              <h1 className="text-xl font-semibold">Link invalid or expired</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">
                Contact your VYNU Pay administrator for a new setup link.
              </p>
            </>
          )}

          <div className="pt-4 border-t flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            PCI-DSS compliant · Card details handled by Stripe, never by VYNU Pay
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
