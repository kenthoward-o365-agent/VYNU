import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Bot, Users, ShoppingCart, Utensils, QrCode, Plug, TrendingUp, TrendingDown, Minus, Sparkles, Coins } from "lucide-react";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";

interface Perf {
  financials: { gross: number; gratuities: number; net: number; aov: number; orders_total: number; orders_billable: number; orders_cancelled: number; refund_amount: number; refund_count: number };
  ai: { cost_usd: number; tokens: number; calls: number; chat_sessions: number; items_added: number; sessions_converted: number; attributed_revenue: number; by_feature: Record<string, { calls: number; cost_usd: number; tokens: number }> };
  diners: { unique: number; unique_prior: number; trend_pct: number | null };
  menu: { total_items: number; priced_items: number; unpriced_items: number; categorised_items: number };
  tables: { total_tables: number; active_tables: number };
  staff: { total: number; active: number };
  pos: null | { pos_provider: string; connection_status: string; auto_push_orders: boolean; last_sync_at: string | null };
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

export default function VenuePerformanceTab({ venueId }: { venueId: string }) {
  const [range, setRange] = useState<DateRange>(getDefaultAuditDate());
  const [data, setData] = useState<Perf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("get_venue_performance", {
        _venue_id: venueId,
        _from: range.from.toISOString(),
        _to: range.to.toISOString(),
      });
      if (!cancelled) {
        if (error) console.error(error);
        setData((data as Perf) || null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [venueId, range]);

  const TrendIcon = (() => {
    const t = data?.diners.trend_pct;
    if (t == null) return Minus;
    if (t > 0) return TrendingUp;
    if (t < 0) return TrendingDown;
    return Minus;
  })();

  const aiMargin = data ? Number(data.ai.attributed_revenue || 0) - Number(data.ai.cost_usd || 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance</h3>
          <p className="text-sm text-muted-foreground">Financials, AI activity, diners, menu & POS posture</p>
        </div>
        <AuditDatePicker value={range} onChange={setRange} />
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Financials */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <KPI icon={DollarSign} label="Gross Revenue" value={money(data.financials.gross)} color="text-emerald-500" sub={`${data.financials.orders_billable} billable`} />
            <KPI icon={DollarSign} label="Net Revenue" value={money(data.financials.net)} color="text-emerald-500" />
            <KPI icon={DollarSign} label="Gratuities" value={money(data.financials.gratuities)} color="text-pink-500" />
            <KPI icon={TrendingUp} label="Avg Order Value" value={money(data.financials.aov)} color="text-indigo-500" />
            <KPI icon={ShoppingCart} label="Refunds" value={money(data.financials.refund_amount)} color="text-red-500" sub={`${data.financials.refund_count} refunds`} />
          </div>

          {/* AI */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />AI Features</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                <KPI icon={Bot} label="Chat sessions" value={data.ai.chat_sessions.toLocaleString()} color="text-primary" sub={`${data.ai.sessions_converted} converted`} />
                <KPI icon={Sparkles} label="Items added by AI" value={data.ai.items_added.toLocaleString()} color="text-primary" />
                <KPI icon={DollarSign} label="AI-attributed revenue" value={money(data.ai.attributed_revenue)} color="text-emerald-500" />
                <KPI icon={Coins} label="AI cost (USD)" value={`$${data.ai.cost_usd.toFixed(4)}`} color="text-amber-500" sub={`${data.ai.calls} calls`} />
                <KPI icon={TrendingUp} label="AI margin" value={`$${aiMargin.toFixed(2)}`} color={aiMargin >= 0 ? "text-emerald-500" : "text-red-500"} />
              </div>
              {Object.keys(data.ai.by_feature || {}).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(data.ai.by_feature).map(([feature, m]) => (
                    <Badge key={feature} variant="secondary" className="text-xs">
                      {feature}: {m.calls} calls · ${m.cost_usd.toFixed(4)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Diners + Menu + Tables + Staff */}
          <div className="grid gap-3 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" />Diners</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{data.diners.unique.toLocaleString()}</p>
                  {data.diners.trend_pct != null && (
                    <span className={`text-xs flex items-center gap-0.5 ${data.diners.trend_pct > 0 ? "text-emerald-500" : data.diners.trend_pct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      <TrendIcon className="h-3 w-3" />{Math.abs(data.diners.trend_pct)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Prior period: {data.diners.unique_prior}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><Utensils className="h-4 w-4 text-amber-500" />Menu</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="text-2xl font-bold">{data.menu.priced_items} <span className="text-sm font-normal text-muted-foreground">/ {data.menu.total_items} priced</span></p>
                <p className="text-xs text-muted-foreground">{data.menu.unpriced_items} unpriced · {data.menu.categorised_items} categorised</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4 text-purple-500" />Tables & QR</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="text-2xl font-bold">{data.tables.active_tables} <span className="text-sm font-normal text-muted-foreground">/ {data.tables.total_tables}</span></p>
                <p className="text-xs text-muted-foreground">active / total QR codes</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-indigo-500" />Users</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="text-2xl font-bold">{data.staff.active} <span className="text-sm font-normal text-muted-foreground">/ {data.staff.total}</span></p>
                <p className="text-xs text-muted-foreground">active / total staff</p>
              </CardContent>
            </Card>
          </div>

          {/* POS */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4 text-cyan-500" />POS Integration</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0">
              {!data.pos ? (
                <p className="text-sm text-muted-foreground">No POS connected — using H&L OrderNow Orders Screen.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Provider</p><p className="font-medium capitalize">{data.pos.pos_provider}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={data.pos.connection_status === "connected" ? "default" : "secondary"} className="capitalize">{data.pos.connection_status}</Badge>
                  </div>
                  <div><p className="text-xs text-muted-foreground">Order routing</p>
                    <p className="font-medium">{data.pos.auto_push_orders ? "Push to POS" : "OrderNow screen"}</p>
                  </div>
                  <div><p className="text-xs text-muted-foreground">Last sync</p>
                    <p className="font-medium">{data.pos.last_sync_at ? new Date(data.pos.last_sync_at).toLocaleString() : "—"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
