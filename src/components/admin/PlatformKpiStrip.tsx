import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Sparkles, Coins, DollarSign, Utensils, QrCode } from "lucide-react";
import type { DateRange } from "@/components/AuditDatePicker";

interface Platform {
  financials: { gross: number; net: number };
  ai: { cost_usd: number; calls: number; chat_sessions: number; items_added: number; attributed_revenue: number };
  diners: { unique: number };
  menu: { total: number; priced: number };
  tables: { total: number };
  top_ai_venues: { venue_id: string; name: string; revenue: number }[];
}

export default function PlatformKpiStrip({ range }: { range: DateRange }) {
  const [data, setData] = useState<Platform | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_platform_performance", {
        _from: range.from.toISOString(),
        _to: range.to.toISOString(),
      });
      if (error) console.error(error);
      setData((data as Platform) || null);
    })();
  }, [range]);

  if (!data) return null;

  const items = [
    { icon: Users, label: "Unique Diners", value: data.diners.unique.toLocaleString(), color: "text-blue-500" },
    { icon: Sparkles, label: "AI Chat Sessions", value: data.ai.chat_sessions.toLocaleString(), color: "text-primary", sub: `${data.ai.items_added} items added` },
    { icon: DollarSign, label: "AI-Attributed Revenue", value: `$${data.ai.attributed_revenue.toFixed(2)}`, color: "text-emerald-500" },
    { icon: Coins, label: "AI Cost (USD)", value: `$${data.ai.cost_usd.toFixed(4)}`, color: "text-amber-500", sub: `${data.ai.calls} calls` },
    { icon: Utensils, label: "Priced Menu Items", value: `${data.menu.priced} / ${data.menu.total}`, color: "text-orange-500" },
    { icon: QrCode, label: "Tables / QR Codes", value: data.tables.total.toLocaleString(), color: "text-purple-500" },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
      {items.map((k) => (
        <Card key={k.label} className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <k.icon className={`h-4 w-4 ${k.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{k.label}</p>
              <p className="text-lg font-bold text-foreground">{k.value}</p>
              {k.sub && <p className="text-[10px] text-muted-foreground">{k.sub}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
