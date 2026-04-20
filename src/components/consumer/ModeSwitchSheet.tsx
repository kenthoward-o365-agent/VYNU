import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { User, Users } from "lucide-react";
import type { SessionMode } from "./SessionModeChooser";

interface ModeSwitchSheetProps {
  open: boolean;
  currentMode: SessionMode;
  hasItemsInCart: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitch: (mode: SessionMode) => void;
}

const ModeSwitchSheet = ({ open, currentMode, hasItemsInCart, onOpenChange, onSwitch }: ModeSwitchSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Switch ordering mode</SheetTitle>
          <SheetDescription>
            {hasItemsInCart
              ? "Clear your cart first to switch modes."
              : "You can switch any time before placing your first order."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          <Button
            variant={currentMode === "solo" ? "default" : "outline"}
            disabled={hasItemsInCart || currentMode === "solo"}
            onClick={() => onSwitch("solo")}
            className="w-full h-14 rounded-2xl justify-start gap-3"
          >
            <User className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Order on my own</div>
              <div className="text-[11px] opacity-70 font-normal">Fires immediately</div>
            </div>
          </Button>
          <Button
            variant={currentMode === "group" ? "default" : "outline"}
            disabled={hasItemsInCart || currentMode === "group"}
            onClick={() => onSwitch("group")}
            className="w-full h-14 rounded-2xl justify-start gap-3"
          >
            <Users className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Group order at this table</div>
              <div className="text-[11px] opacity-70 font-normal">Bundles with others</div>
            </div>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ModeSwitchSheet;
