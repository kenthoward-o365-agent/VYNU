import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  venue_id: string;
  sessions: number;
  sessions_with_cart: number;
  sessions_with_checkout: number;
  sessions_converted: number;
  cart_abandoned: number;
  checkout_abandoned: number;
}

interface VenueRow extends Row {
  venue_name: string;
}

const PlatformFunnelCard = () => {
  const [rows, setRows] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const [{ data: metrics }, { data: venues }] = await Promise.all([
        supabase
          .from("diner_session_metrics_daily" as never)
          .select("*")
          .gte("day", since.toISOString().slice(0, 10)),
        supabase.from("venues").select("id, name"),
      ]);
      const venueMap = new Map((venues ?? []).map((v) => [v.id, v.name]));
      const agg = new Map<string, Row>();
      for (const r of (metrics as Row[]) ?? []) {
        const cur = agg.get(r.venue_id) ?? {
          venue_id: r.venue_id,
          sessions: 0, sessions_with_cart: 0, sessions_with_checkout: 0,
          sessions_converted: 0, cart_abandoned: 0, checkout_abandoned: 0,
        };
        cur.sessions += r.sessions ?? 0;
        cur.sessions_with_cart += r.sessions_with_cart ?? 0;
        cur.sessions_with_checkout += r.sessions_with_checkout ?? 0;
        cur.sessions_converted += r.sessions_converted ?? 0;
        cur.cart_abandoned += r.cart_abandoned ?? 0;
        cur.checkout_abandoned += r.checkout_abandoned ?? 0;
        agg.set(r.venue_id, cur);
      }
      const out: VenueRow[] = Array.from(agg.values()).map((r) => ({
        ...r,
        venue_name: venueMap.get(r.venue_id) ?? "Unknown",
      }));
      out.sort((a, b) => {
        const ar = a.sessions_with_cart > 0 ? a.cart_abandoned / a.sessions_with_cart : 0;
        const br = b.sessions_with_cart > 0 ? b.cart_abandoned / b.sessions_with_cart : 0;
        return br - ar;
      });
      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totals = rows.reduce(
    (a, r) => ({
      sessions: a.sessions + r.sessions,
      with_cart: a.with_cart + r.sessions_with_cart,
      with_checkout: a.with_checkout + r.sessions_with_checkout,
      converted: a.converted + r.sessions_converted,
      cart_abandoned: a.cart_abandoned + r.cart_abandoned,
      checkout_abandoned: a.checkout_abandoned + r.checkout_abandoned,
    }),
    { sessions: 0, with_cart: 0, with_checkout: 0, converted: 0, cart_abandoned: 0, checkout_abandoned: 0 },
  );

  const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Platform funnel (last 7 days)</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Sessions" value={String(totals.sessions)} />
              <Stat label="Conversion" value={`${pct(totals.converted, totals.sessions)}%`} />
              <Stat label="Cart abandon" value={`${pct(totals.cart_abandoned, totals.with_cart)}%`} />
              <Stat label="Checkout abandon" value={`${pct(totals.checkout_abandoned, totals.with_checkout)}%`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2">Venue</th>
                    <th className="py-2 text-right">Sessions</th>
                    <th className="py-2 text-right">Conv.</th>
                    <th className="py-2 text-right">Cart abandon</th>
                    <th className="py-2 text-right">Checkout abandon</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.venue_id} className="border-b last:border-0">
                      <td className="py-2 truncate max-w-[200px]">{r.venue_name}</td>
                      <td className="py-2 text-right">{r.sessions}</td>
                      <td className="py-2 text-right">{pct(r.sessions_converted, r.sessions)}%</td>
                      <td className="py-2 text-right">{pct(r.cart_abandoned, r.sessions_with_cart)}%</td>
                      <td className="py-2 text-right">{pct(r.checkout_abandoned, r.sessions_with_checkout)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-xl font-semibold">{value}</div>
  </div>
);

export default PlatformFunnelCard;
