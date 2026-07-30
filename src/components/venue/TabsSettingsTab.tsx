import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Receipt, MapPin, ShieldCheck, SplitSquareHorizontal } from "lucide-react";

interface ZoneRule {
  zone: string;
  tabs_enabled: boolean;
  require_preauth: boolean;
  preauth_amount: number;
  max_tab_amount: number | null;
  allow_split_payments: boolean;
  tableCount: number;
}

const blank = (zone: string, tableCount: number): ZoneRule => ({
  zone,
  tabs_enabled: false,
  require_preauth: false,
  preauth_amount: 50,
  max_tab_amount: null,
  allow_split_payments: true,
  tableCount,
});

export default function TabsSettingsTab({ venueId }: { venueId: string }) {
  const [rules, setRules] = useState<ZoneRule[]>([]);
  const [unzonedTables, setUnzonedTables] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: tables }, { data: zoneRows }] = await Promise.all([
        supabase.from("tables").select("id, zone").eq("venue_id", venueId),
        supabase.from("venue_tab_zones").select("*").eq("venue_id", venueId),
      ]);

      const counts = new Map<string, number>();
      let unzoned = 0;
      for (const t of tables || []) {
        const z = (t as any).zone?.trim();
        if (!z) unzoned++;
        else counts.set(z, (counts.get(z) || 0) + 1);
      }
      setUnzonedTables(unzoned);

      const existing = new Map<string, any>();
      for (const r of (zoneRows as any[]) || []) existing.set(r.zone, r);
      for (const z of existing.keys()) if (!counts.has(z)) counts.set(z, 0);

      const merged: ZoneRule[] = Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([zone, tableCount]) => {
          const r = existing.get(zone);
          if (!r) return blank(zone, tableCount);
          return {
            zone,
            tabs_enabled: !!r.tabs_enabled,
            require_preauth: !!r.require_preauth,
            preauth_amount: Number(r.preauth_amount ?? 50),
            max_tab_amount: r.max_tab_amount === null ? null : Number(r.max_tab_amount),
            allow_split_payments: r.allow_split_payments !== false,
            tableCount,
          };
        });
      setRules(merged);
      setLoading(false);
    })();
  }, [venueId]);

  const patch = (zone: string, changes: Partial<ZoneRule>) =>
    setRules((rs) => rs.map((r) => (r.zone === zone ? { ...r, ...changes } : r)));

  const save = async () => {
    setSaving(true);
    const payload = rules.map((r) => ({
      venue_id: venueId,
      zone: r.zone,
      tabs_enabled: r.tabs_enabled,
      require_preauth: r.require_preauth,
      preauth_amount: r.preauth_amount || 0,
      max_tab_amount: r.max_tab_amount,
      allow_split_payments: r.allow_split_payments,
    }));
    const { error } = await supabase
      .from("venue_tab_zones")
      .upsert(payload as any, { onConflict: "venue_id,zone" });
    if (error) toast.error(error.message);
    else toast.success("Tab settings saved");
    setSaving(false);
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Open tabs by area
          </CardTitle>
          <CardDescription>
            Choose which areas of the venue can run a tab and pay at the end. Areas left off stay
            pay-at-order — diners pay for each round as they go.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No areas found. Assign a zone to your tables in Tables &amp; QR first (e.g. Main Bar,
              Bistro, Rooftop) and they'll appear here.
            </p>
          )}

          {rules.map((r, i) => (
            <div key={r.zone} className="space-y-4">
              {i > 0 && <Separator />}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {r.zone}
                    <Badge variant="secondary" className="text-[10px]">
                      {r.tableCount} table{r.tableCount === 1 ? "" : "s"}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.tabs_enabled
                      ? "Diners can add rounds to a tab and settle at the end."
                      : "Pay at order — every round is paid up front."}
                  </p>
                </div>
                <Switch
                  checked={r.tabs_enabled}
                  onCheckedChange={(v) => patch(r.zone, { tabs_enabled: v })}
                />
              </div>

              {r.tabs_enabled && (
                <div className="grid sm:grid-cols-2 gap-4 pl-6">
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" /> Require card pre-authorisation
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Optional. Holds a deposit on the diner's card before the tab opens; it
                          comes off the final bill.
                        </p>
                      </div>
                      <Switch
                        checked={r.require_preauth}
                        onCheckedChange={(v) => patch(r.zone, { require_preauth: v })}
                      />
                    </div>
                  </div>

                  {r.require_preauth && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Pre-auth amount ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={r.preauth_amount}
                        onChange={(e) =>
                          patch(r.zone, { preauth_amount: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Tab limit ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="10"
                      placeholder="No limit"
                      value={r.max_tab_amount ?? ""}
                      onChange={(e) =>
                        patch(r.zone, {
                          max_tab_amount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Diners must settle before ordering past this amount. Leave blank for no limit.
                    </p>
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-muted/40 p-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <SplitSquareHorizontal className="h-3.5 w-3.5" /> Allow split payments
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Let the table split the bill across people and mix payment types — card,
                        wallet, gift card or voucher.
                      </p>
                    </div>
                    <Switch
                      checked={r.allow_split_payments}
                      onCheckedChange={(v) => patch(r.zone, { allow_split_payments: v })}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {unzonedTables > 0 && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              {unzonedTables} table{unzonedTables === 1 ? " has" : "s have"} no area assigned — those
              tables stay pay-at-order. Set a zone on them in Tables &amp; QR to enable tabs.
            </p>
          )}

          {rules.length > 0 && (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save tab settings"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
