import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  venueId: string;
  orderTotal: number;
  /** Sum of already-refunded amounts on this order. */
  alreadyRefunded: number;
  onComplete: () => void;
}

export default function RefundDialog({
  open, onOpenChange, orderId, venueId, orderTotal, alreadyRefunded, onComplete,
}: RefundDialogProps) {
  const { user } = useAuth();
  const remaining = Math.max(0, Number(orderTotal) - Number(alreadyRefunded));
  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setReason("");
    }
  }, [open, remaining]);

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) { toast.error("Enter a refund amount"); return; }
    if (value > remaining + 0.001) { toast.error(`Maximum refund is $${remaining.toFixed(2)}`); return; }
    if (!user) { toast.error("Not signed in"); return; }

    setSubmitting(true);
    try {
      // Call H&L OrderNOW Pay refund
      const { data, error } = await supabase.functions.invoke("adyen-payment", {
        body: { action: "refund", venue_id: venueId, order_id: orderId, amount: value, reason },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const pspRef = data?.pspReference || null;
      const status = (data?.status === "received" || data?.resultCode === "received") ? "received" : "pending";

      // Log refund
      const { error: insErr } = await supabase.from("order_refunds").insert({
        order_id: orderId,
        venue_id: venueId,
        amount: value,
        reason: reason || null,
        psp_reference: pspRef,
        status,
        requested_by: user.id,
      });
      if (insErr) throw insErr;

      // Re-open or fully refund the order
      const newRefunded = alreadyRefunded + value;
      const fullyRefunded = newRefunded >= Number(orderTotal) - 0.001;
      const { error: updErr } = await supabase
        .from("orders")
        .update({ status: fullyRefunded ? "refunded" : "received" })
        .eq("id", orderId);
      if (updErr) throw updErr;

      toast.success(fullyRefunded ? "Order fully refunded" : `Refunded $${value.toFixed(2)} — order re-opened`);
      onComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Refund failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-open & Refund Order</DialogTitle>
          <DialogDescription>
            Process a refund through H&L OrderNOW Pay. The order will be re-opened so staff can update it. Fully-refunded orders are marked Refunded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Order total</span><span className="font-medium">${Number(orderTotal).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already refunded</span><span className="font-medium">${Number(alreadyRefunded).toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">Available to refund</span><span className="font-bold">${remaining.toFixed(2)}</span></div>
          </div>
          <div>
            <Label>Refund amount</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer dissatisfied, item out of stock"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || remaining <= 0}>
            {submitting ? "Processing…" : "Process Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
