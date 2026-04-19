import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderAgeBadgeProps {
  createdAt: string;
  /** Stop ticking once order has reached a terminal state (served/paid/cancelled) */
  frozen?: boolean;
}

/**
 * Live-updating elapsed time since an order was placed.
 * Colour shifts with age so kitchen/bar can spot stale orders at a glance:
 *  - <5 min  : muted
 *  - 5–10    : amber
 *  - 10–20   : orange
 *  - 20+     : red (urgent)
 */
const OrderAgeBadge = ({ createdAt, frozen = false }: OrderAgeBadgeProps) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (frozen) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [frozen]);

  const createdMs = new Date(createdAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - createdMs) / 1000));
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;

  const label =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : minutes >= 1
      ? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
      : `${seconds}s`;

  const tone = frozen
    ? "bg-secondary text-muted-foreground"
    : minutes >= 20
    ? "bg-destructive/15 text-destructive"
    : minutes >= 10
    ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
    : minutes >= 5
    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    : "bg-secondary text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
        tone
      )}
      title={`Placed ${new Date(createdAt).toLocaleTimeString()}`}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
};

export default OrderAgeBadge;
