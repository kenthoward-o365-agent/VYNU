import { ReactNode, useState } from "react";
import { Smartphone, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
}

const DEVICES = [
  { id: "phone" as const, label: "Phone", icon: Smartphone, width: 375, height: 700, radius: "2.5rem", notchW: "w-28" },
  { id: "tablet" as const, label: "iPad", icon: Tablet, width: 768, height: 1024, radius: "1.5rem", notchW: "w-20" },
];

const MobilePreviewFrame = ({ children }: Props) => {
  const [device, setDevice] = useState<"phone" | "tablet">("phone");
  const d = DEVICES.find((dev) => dev.id === device)!;

  return (
    <div className="flex flex-col items-center h-full bg-muted/30">
      {/* Device toggle */}
      <div className="flex items-center gap-1 py-3">
        {DEVICES.map((dev) => (
          <button
            key={dev.id}
            onClick={() => setDevice(dev.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              device === dev.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <dev.icon className="h-3.5 w-3.5" />
            {dev.label}
          </button>
        ))}
      </div>

      {/* Device frame */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-4 pb-4">
        <div className="relative" style={{ width: d.width, maxWidth: "100%" }}>
          <div
            className="border-4 border-foreground/20 bg-black overflow-hidden shadow-2xl"
            style={{ borderRadius: d.radius }}
          >
            {/* Notch / camera */}
            <div className="flex justify-center pt-2 pb-1 bg-black">
              <div className={cn("h-5 bg-foreground/20 rounded-full", d.notchW)} />
            </div>
            {/* Screen */}
            <div className="overflow-y-auto bg-background" style={{ height: d.height }}>
              {children}
            </div>
            {/* Home indicator */}
            <div className="flex justify-center py-2 bg-black">
              <div className="w-32 h-1 bg-foreground/30 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobilePreviewFrame;
