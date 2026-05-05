import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Clock } from "lucide-react";

interface IdleTimeoutModalProps {
  open: boolean;
  secondsLeft: number;
  totalSeconds?: number;
  onStay: () => void;
  onEnd: () => void;
}

const IdleTimeoutModal = ({
  open,
  secondsLeft,
  totalSeconds = 60,
  onStay,
  onEnd,
}: IdleTimeoutModalProps) => {
  const pct = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const circumference = 2 * Math.PI * 32;
  const offset = circumference * (1 - pct);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onStay(); }}>
      <DialogContent className="max-w-xs text-center">
        <DialogHeader>
          <div className="mx-auto mb-2 relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
              <circle
                cx="40"
                cy="40"
                r="32"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold">
              {secondsLeft}
            </div>
          </div>
          <DialogTitle className="flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" /> Still here?
          </DialogTitle>
          <DialogDescription>
            Your session will close due to inactivity. Tap below to stay.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <Button onClick={onStay} className="w-full">I'm still here</Button>
          <Button onClick={onEnd} variant="ghost" className="w-full">End session</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IdleTimeoutModal;
