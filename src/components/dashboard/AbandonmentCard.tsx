import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, TrendingDown, Percent } from "lucide-react";

interface Row {
  day: string;
  sessions: number;
  sessions_with_cart: number;
  sessions_with_checkout: number;
  sessions_converted: number;
  cart_abandoned: number;
  checkout_abandoned: number;
}

interface Props {
  venueId: string;
}

const AbandonmentCard = ({ venueId }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const { data } = await supabase
        .from("diner_session_metrics_daily" as never)
        .select("*")
        .eq("venue_id", venueId)
        .gte("day", since.toISOString().slice(0, 10))
        .order("day", { ascending: true });
      if (!cancelled) {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [venueId]);

  const totals = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + (r.sessions ?? 0),
      with_cart: acc.with_cart + (r.sessions_with_cart ?? 0),
      with_checkout: acc.with_checkout + (r.sessions_with_checkout ?? 0),
      converted: acc.converted + (r.sessions_converted ?? 0),
      cart_abandoned: acc.cart_abandoned + (r.cart_abandoned ?? 0),
      checkout_abandoned: acc.checkout_abandoned + (r.checkout_abandoned ?? 0),
    }),
    { sessions: 0, with_cart: 0, with_checkout: 0, converted: 0, cart_abandoned: 0, checkout_abandoned: 0 },
  );

  const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);
  const conversionRate = pct(totals.converted, totals.sessions);
  const cartAbandonRate = pct(totals.cart_abandoned, totals.with_cart);
  const checkoutAbandonRate = pct(totals.checkout_abandoned, totals.with_checkout);

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Cart abandonment (last 7 days)</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : totals.sessions === 0 ? (
          <div className="text-sm text-muted-foreground">No diner sessions yet.</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={<Percent className="h-4 w-4" />} label="Conversion" value={`${conversionRate}%`} sub={`${totals.converted}/${totals.sessions}`} />
            <Stat icon={<ShoppingCart className="h-4 w-4" />} label="Cart abandon" value={`${cartAbandonRate}%`} sub={`${totals.cart_abandoned}/${totals.with_cart}`} />
            <Stat icon={<TrendingDown className="h-4 w-4" />} label="Checkout abandon" value={`${checkoutAbandonRate}%`} sub={`${totals.checkout_abandoned}/${totals.with_checkout}`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) => (
  <div className="rounded-lg border border-border p-3 flex flex-col gap-1 min-w-0">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}<span className="truncate">{label}</span></div>
    <div className="text-xl font-semibold">{value}</div>
    <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
  </div>
);

export default AbandonmentCard;
