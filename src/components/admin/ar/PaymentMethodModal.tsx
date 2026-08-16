import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * PCI-compliant payment method setup modal.
 * Uses Stripe Checkout (setup mode) — redirects to Stripe-hosted page
 * so no card data ever touches our origin. SAQ A scope.
 */
export default function PaymentMethodModal({
  venueId,
  venueName,
  onClose,
}: {
  venueId: string;
  venueName: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const launchCheckout = async (methodTypes: string[]) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ar-create-setup-checkout", {
        body: { venue_id: venueId, method_types: methodTypes, return_url: window.location.origin },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      // SEC-04: the backend no longer leaks internal error detail (e.g. env-var
      // names) to the client, so show a generic, non-sensitive message.
      toast({
        title: "Could not start setup",
        description:
          "Could not start payment setup. If this venue was just created, its payment processor may not be configured yet — please try again or contact support.",
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add payment method — {venueName}</DialogTitle>
          <DialogDescription>
            You'll be redirected to a secure Stripe-hosted page to enter card or bank details.
            No payment information ever touches VYNU Pay servers — full PCI-DSS SAQ A compliance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <Button
            className="w-full justify-between"
            onClick={() => launchCheckout(["card"])}
            disabled={busy}
          >
            <span>Add credit / debit card</span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          </Button>

          <Button
            className="w-full justify-between"
            variant="outline"
            onClick={() => launchCheckout(["au_becs_debit"])}
            disabled={busy}
          >
            <span>Add BECS direct debit (AU bank)</span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          </Button>

          <Button
            className="w-full justify-between"
            variant="outline"
            onClick={() => launchCheckout(["us_bank_account"])}
            disabled={busy}
          >
            <span>Add ACH direct debit (US bank)</span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Powered by Stripe. Card numbers are entered on Stripe's secure infrastructure
          and never transmitted to or stored by VYNU Pay.
        </p>
      </DialogContent>
    </Dialog>
  );
}
