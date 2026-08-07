import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { auMobileSchema } from "@/lib/validation";
import { toast } from "@/hooks/use-toast";

interface TextReceiptButtonProps {
  venueId: string;
  orderId: string;
  defaultPhone?: string | null;
  venueName?: string | null;
}

const TextReceiptButton = ({ venueId, orderId, defaultPhone, venueName }: TextReceiptButtonProps) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone || "");
  const [optIn, setOptIn] = useState(true);
  const [sending, setSending] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleSend = async () => {
    // Validate and normalise here rather than only checking for non-blank. The
    // schema mirrors normalizeAuPhone() in send-receipt-sms, so a number this
    // accepts is one the function will accept — previously anything non-empty
    // was sent and silently failed downstream.
    const parsed = auMobileSchema.safeParse(phone);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Enter a valid mobile number";
      setPhoneError(message);
      toast({ title: "Check the number", description: message, variant: "destructive" });
      return;
    }
    setPhoneError(null);
    const normalisedPhone = parsed.data;
    setSending(true);
    try {
      const receiptUrl = window.location.href;
      const { data, error } = await supabase.functions.invoke("send-receipt-sms", {
        body: {
          venue_id: venueId,
          order_id: orderId,
          phone: normalisedPhone,
          marketing_opt_in: optIn,
          receipt_url: receiptUrl,
        },
      });
      if (error) throw error;
      const simulated = (data as any)?.simulated;
      toast({
        title: simulated ? "Receipt queued (test mode)" : "Receipt sent",
        description: simulated
          ? "SMS is in simulated mode — no real text was sent, but your number was saved."
          : `We've texted your receipt to ${normalisedPhone}.`,
      });
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Couldn't send",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="w-full h-12 rounded-xl gap-2"
      >
        <MessageSquare className="h-4 w-4" />
        Text Me a Copy
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Text your receipt</DialogTitle>
            <DialogDescription>
              We'll send a secure link to your receipt by SMS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sms-phone">Mobile number</Label>
              <Input
                id="sms-phone"
                type="tel"
                inputMode="tel"
                placeholder="04xx xxx xxx"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(null); }}
                autoFocus
              />
              {phoneError && (
                <p role="alert" aria-live="polite" className="text-destructive text-xs mt-1">
                  {phoneError}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">Australian mobile numbers supported.</p>
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 cursor-pointer">
              <Checkbox
                checked={optIn}
                onCheckedChange={(v) => setOptIn(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs leading-snug">
                Yes, I'd like to hear about specials, events and offers from{" "}
                <span className="font-medium">{venueName || "this venue"}</span> by SMS. Reply STOP anytime to opt out.
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending} className="gap-2">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TextReceiptButton;
