import { CheckCircle2, Clock, ChefHat, Bell, CreditCard, HandPlatter, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "received" | "preparing" | "ready" | "served" | "paid" | "cancelled";

interface OrderStatusProps {
  orderId: string;
  status: Status;
  total: number;
  createdAt: string;
  extraWaitMinutes?: number;
  /** How the venue/zone serves food: brought to the table, or collected by the diner. */
  serviceMode?: "table_delivery" | "counter_pickup";
  /** Where to collect from when serviceMode is counter_pickup (e.g. "Main Bar"). */
  pickupLocation?: string;
  /**
   * The diner has already paid (server-stamped). Suppresses the "Pay Now"
   * call to action and states so, so a paid diner is never asked to pay twice.
   */
  alreadyPaid?: boolean;
}

const steps: { status: Status; icon: typeof Clock; label: string }[] = [
  { status: "received", icon: Clock, label: "Received" },
  { status: "preparing", icon: ChefHat, label: "Preparing" },
  { status: "ready", icon: Bell, label: "Ready" },
  { status: "served", icon: CheckCircle2, label: "Served" },
];

const statusOrder: Status[] = ["received", "preparing", "ready", "served", "paid"];

const OrderStatus = ({
  status,
  total,
  createdAt,
  extraWaitMinutes = 0,
  serviceMode = "table_delivery",
  pickupLocation,
  alreadyPaid = false,
}: OrderStatusProps) => {
  const currentIdx = statusOrder.indexOf(status);
  const isPickup = serviceMode === "counter_pickup";
  const collectAt = pickupLocation?.trim() || "the counter";

  const pickupSteps = isPickup
    ? steps.map((s) =>
        s.status === "ready"
          ? { ...s, label: "Collect" }
          : s.status === "served"
            ? { ...s, label: "Collected" }
            : s
      )
    : steps;

  return (
    <div className="px-5 py-6">
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="font-semibold">Order Placed!</h3>
            <p className="text-muted-foreground text-xs">
              {new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            {/* AC2 — say what happens next, not just that something happened. */}
            {isPickup && status !== "ready" && (
              <p className="text-muted-foreground text-xs mt-1 flex items-center gap-1">
                <Store className="h-3 w-3" />
                Collect from {collectAt} — we'll text you when it's ready
              </p>
            )}
            {!isPickup && status !== "ready" && (
              <p className="text-muted-foreground text-xs mt-1 flex items-center gap-1">
                <HandPlatter className="h-3 w-3" />
                Sent to the venue — we'll bring it to your table
              </p>
            )}
            {extraWaitMinutes > 0 && (
              <p className="text-warning text-xs mt-1">
                Kitchen is busy — extra ~{extraWaitMinutes}m wait
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className="text-lg font-bold text-primary">${total.toFixed(2)}</span>
            {alreadyPaid && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80 leading-tight">
                Paid
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between relative">
          <div className="absolute top-4 left-8 right-8 h-0.5 bg-border" />
          <div
            className="absolute top-4 left-8 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `${Math.max(0, (currentIdx / (steps.length - 1)) * 100 - 10)}%` }}
          />

          {pickupSteps.map((step) => {
            const isActive = statusOrder.indexOf(step.status) <= currentIdx;
            const Icon = step.icon;
            return (
              <div key={step.status} className="flex flex-col items-center gap-1.5 z-10">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn("text-[10px] font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {status === "ready" && (
          <div
            className={cn(
              "mt-6 rounded-xl p-4 flex items-start gap-3",
              isPickup ? "bg-primary/10 border border-primary/30" : "bg-muted/50"
            )}
          >
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              {isPickup ? <Store className="h-4 w-4" /> : <HandPlatter className="h-4 w-4" />}
            </div>
            <div>
              <p className="font-semibold text-sm">
                {isPickup ? `Your order is ready — collect it at ${collectAt}` : "Your order is ready"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPickup
                  ? "Show this screen or give your name when you collect. We've also sent you a text."
                  : "A team member is bringing it to your table now."}
              </p>
            </div>
          </div>
        )}

        {status === "served" && !alreadyPaid && (
          <Button className="w-full mt-6 rounded-xl h-12 gap-2">
            <CreditCard className="h-4 w-4" />
            Pay Now — ${total.toFixed(2)}
          </Button>
        )}
      </div>
    </div>
  );
};

export default OrderStatus;
