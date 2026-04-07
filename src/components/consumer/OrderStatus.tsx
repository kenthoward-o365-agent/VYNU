import { CheckCircle2, Clock, ChefHat, Bell, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "received" | "preparing" | "ready" | "served" | "paid" | "cancelled";

interface OrderStatusProps {
  orderId: string;
  status: Status;
  total: number;
  createdAt: string;
}

const steps: { status: Status; icon: typeof Clock; label: string }[] = [
  { status: "received", icon: Clock, label: "Received" },
  { status: "preparing", icon: ChefHat, label: "Preparing" },
  { status: "ready", icon: Bell, label: "Ready" },
  { status: "served", icon: CheckCircle2, label: "Served" },
];

const statusOrder: Status[] = ["received", "preparing", "ready", "served", "paid"];

const OrderStatus = ({ status, total, createdAt }: OrderStatusProps) => {
  const currentIdx = statusOrder.indexOf(status);

  return (
    <div className="px-5 py-6">
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="font-semibold">Order Placed!</h3>
            <p className="text-muted-foreground text-xs">
              {new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <span className="text-lg font-bold text-primary">${total.toFixed(2)}</span>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between relative">
          {/* Line */}
          <div className="absolute top-4 left-8 right-8 h-0.5 bg-border" />
          <div
            className="absolute top-4 left-8 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `${Math.max(0, (currentIdx / (steps.length - 1)) * 100 - 10)}%` }}
          />

          {steps.map((step, i) => {
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

        {status === "served" && (
          <Button className="w-full mt-6 rounded-xl h-12 gap-2">
            <CreditCard className="h-4 w-4" />
            Pay Now — ${total.toFixed(2)}
          </Button>
        )}
      </div>
    </div>
  );
};

// Fix: need Button import
import { Button } from "@/components/ui/button";

export default OrderStatus;
