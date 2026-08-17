// AI spend — reads ai_usage_log (RLS: platform admins see every venue;
// venue staff would see only their own). Every aiChat call that passes a
// `usage` context lands here, priced from ai_model_prices at call time.
// A model id without a price row logs cost 0 — flagged below, because
// silent zero-cost rows corrupt the forecast.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UsageRow {
  feature: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

const DAY_MS = 24 * 3600_000;

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(4)}`;

export default function AiSpendCard() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 90 * DAY_MS).toISOString();
      const { data } = await supabase
        .from("ai_usage_log")
        .select("feature, model, prompt_tokens, completion_tokens, cost_usd, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (!cancelled) {
        setRows((data as UsageRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const total = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    const last7 = rows.filter((r) => now - new Date(r.created_at).getTime() <= 7 * DAY_MS);
    const cost7 = last7.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    // Forecast: average daily spend over the trailing week (or since the
    // first row when younger than a week), projected to 30 days. Crude by
    // design — it moves as soon as real diner traffic shows up.
    const oldest = rows.length
      ? Math.min(...rows.map((r) => new Date(r.created_at).getTime()))
      : now;
    const observedDays = Math.max(Math.min((now - oldest) / DAY_MS, 7), 1 / 24);
    const perDay = cost7 / Math.min(observedDays, 7);
    const zeroCost = rows.filter((r) => (r.cost_usd ?? 0) === 0).length;

    const byFeature = new Map<string, { calls: number; cost: number; inTok: number; outTok: number; model: string }>();
    for (const r of rows) {
      const f = byFeature.get(r.feature) ?? { calls: 0, cost: 0, inTok: 0, outTok: 0, model: r.model };
      f.calls += 1;
      f.cost += r.cost_usd ?? 0;
      f.inTok += r.prompt_tokens ?? 0;
      f.outTok += r.completion_tokens ?? 0;
      byFeature.set(r.feature, f);
    }
    return {
      total,
      cost7,
      perDay,
      forecast30: perDay * 30,
      calls: rows.length,
      zeroCost,
      features: [...byFeature.entries()].sort((a, b) => b[1].cost - a[1].cost),
    };
  }, [rows]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">AI Spend (last 90 days)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Provider token costs from ai_usage_log, priced per call. Forecast is
          trailing-week daily average × 30.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total (90d)", value: usd(stats.total) },
                { label: "Last 7 days", value: usd(stats.cost7) },
                { label: "Per day (avg)", value: usd(stats.perDay) },
                { label: "30-day forecast", value: usd(stats.forecast30) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-lg font-semibold text-foreground">{k.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3">Feature</th>
                    <th className="py-1.5 pr-3">Model</th>
                    <th className="py-1.5 pr-3 text-right">Calls</th>
                    <th className="py-1.5 pr-3 text-right">Tokens in/out</th>
                    <th className="py-1.5 pr-3 text-right">Cost</th>
                    <th className="py-1.5 text-right">Avg / call</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.features.map(([feature, f]) => (
                    <tr key={feature} className="border-b border-border/50">
                      <td className="py-1.5 pr-3 font-medium text-foreground">{feature}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{f.model}</td>
                      <td className="py-1.5 pr-3 text-right">{f.calls.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">
                        {f.inTok.toLocaleString()} / {f.outTok.toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{usd(f.cost)}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {usd(f.cost / f.calls)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {stats.zeroCost > 0 && (
              <p className="text-xs">
                <Badge variant="destructive" className="text-xs mr-2">
                  {stats.zeroCost} zero-cost {stats.zeroCost === 1 ? "call" : "calls"}
                </Badge>
                <span className="text-muted-foreground">
                  A model without a row in ai_model_prices logs as $0 — add the
                  price row or these skew every number above.
                </span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
