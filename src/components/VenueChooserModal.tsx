import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useVenue } from "@/contexts/VenueContext";

/**
 * Forces operators with access to >1 venue to explicitly pick which venue
 * they want to work in (no silent auto-pick of "venues[0]"). Their choice
 * can optionally be persisted server-side as their primary venue.
 */
export function VenueChooserModal() {
  const { needsVenueChoice, venues, switchVenue, setPrimaryVenue } = useVenue();
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!needsVenueChoice) return null;

  const handleConfirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (pin) {
        await setPrimaryVenue(selected);
      } else {
        switchVenue(selected);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Could not set venue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choose your venue</DialogTitle>
          <DialogDescription>
            You have access to multiple venues. Pick the one you want to work in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 max-h-72 overflow-y-auto -mx-2 px-2">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v.id)}
              className={`w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                selected === v.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{v.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{v.venue_type}</p>
              </div>
              {selected === v.id && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={pin} onCheckedChange={(c) => setPin(!!c)} />
          Remember as my default venue
        </label>

        <Button onClick={handleConfirm} disabled={!selected || busy} className="w-full">
          {busy ? "Setting…" : "Continue"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
