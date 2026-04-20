import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface VenueStatus {
  id: string;
  name: string;
  label: string;
  is_terminal: boolean;
  display_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  venueId: string;
  /** Active, non-terminal statuses the order can be reset to. */
  statuses: VenueStatus[];
  onComplete: () => void;
}

/**
 * Re-open a closed/terminal order to an earlier (non-terminal) status.
 * No payment movement happens — this is purely a status reset.
 */
export default function ReopenStatusDialog({
  open,
  onOpenChange,
  orderId,
  statuses,
  onComplete,
}: Props) {
  const reopenable = statuses
    .filter((s) => !s.is_terminal)
    .sort((a, b) => a.display_order - b.display_order);
  const [target, setTarget] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setTarget(reopenable[0]?.name || "");
  }, [open, reopenable.length]);

  const submit = async () => {
    if (!target) {
      toast.error("Choose a status");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: target as any })
        .eq("id", orderId);
      if (error) throw error;
      const label =
        reopenable.find((s) => s.name === target)?.label || target;
      toast.success(`Order re-opened to ${label}`);
      onComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to re-open order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-open Order</DialogTitle>
          <DialogDescription>
            Move this order back to an active status. No payment is processed —
            for refunds use "Re-open & Refund" instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Re-open to status</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a status" />
              </SelectTrigger>
              <SelectContent>
                {reopenable.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reopenable.length === 0 && (
              <p className="text-xs text-destructive mt-1">
                No active statuses configured for this venue.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !target}>
            {submitting ? "Re-opening…" : "Re-open Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
