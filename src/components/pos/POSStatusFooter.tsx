import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface POSStatusFooterProps {
  version?: string;
  right?: React.ReactNode;
}

export default function POSStatusFooter({ version = "v1.0", right }: POSStatusFooterProps) {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const Led = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "h-2 w-2 rounded-full ring-2 ring-black/40",
          ok ? "bg-[hsl(var(--pos-led-on))] shadow-[0_0_6px_hsl(var(--pos-led-on))]" : "bg-[hsl(var(--pos-led-off))]"
        )}
      />
      <span className="opacity-80">{label}</span>
    </span>
  );

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 h-8 text-[11px] uppercase tracking-wider border-t"
      style={{
        background: "hsl(var(--pos-status-bar))",
        color: "hsl(var(--pos-status-fg))",
        borderColor: "hsl(var(--pos-chassis-edge))",
      }}
    >
      <div className="flex items-center gap-4">
        <Led ok={online} label={online ? "Online" : "Offline"} />
        <Led ok label="Printer" />
        <Led ok label="Card Terminal" />
      </div>
      <div className="flex items-center gap-3">
        {right}
        <span className="opacity-60 tabular-nums">{version}</span>
      </div>
    </div>
  );
}
