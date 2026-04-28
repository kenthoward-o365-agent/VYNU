import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaired: () => void;
}

export default function PairTerminalDialog({ open, onOpenChange, onPaired }: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) {
      toast.error("Enter the 6-character pairing code");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("pair_display_terminal" as any, {
      _code: trimmed,
      _user_agent: navigator.userAgent,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.device_token) {
      toast.error("Pairing failed");
      return;
    }
    localStorage.setItem("shyndig_terminal_token", result.device_token);
    toast.success(`Paired as "${result.terminal_name}"`);
    onOpenChange(false);
    onPaired();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair this Terminal</DialogTitle>
          <DialogDescription>
            Enter the 6-character code shown when the manager created this terminal in Order Display System → Display Terminals.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pair-code">Pairing code</Label>
          <Input
            id="pair-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7-9F2"
            className="text-center text-xl font-mono tracking-widest uppercase"
            maxLength={7}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            This binds this browser to a station view. Once paired, only orders routed to this terminal's areas will appear.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Pairing…" : "Pair"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
