import SectionLinks from "@/components/SectionLinks";
import { Monitor, Sliders } from "lucide-react";

export default function OrderSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Order Settings</h2>
        <p className="text-muted-foreground">Configure how orders are displayed and throttled across your venue.</p>
      </div>
      <SectionLinks
        items={[
          {
            key: "statuses",
            label: "Order Display System",
            description: "Display areas, terminals and order workflow statuses",
            icon: Monitor,
            to: "/orders/statuses",
          },
          {
            key: "throttling",
            label: "Operational Throttling",
            description: "Auto-pace incoming orders during peak load",
            icon: Sliders,
            to: "/orders/throttling",
          },
        ]}
      />
    </div>
  );
}
