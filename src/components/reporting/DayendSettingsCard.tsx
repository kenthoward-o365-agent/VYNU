// Dayend Close Settings — auto-run toggle, venue-local run time, and the
// open-order strategy that gates every close (manual and auto alike):
//   halt      — refuse to close while open orders exist
//   autoclose — sweep open orders to the Internal Accounting payment type
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Clock } from "lucide-react";

interface Props {
  venueId: string;
  venueTimezone: string | null;
}

interface Settings {
  auto_close_enabled: boolean;
  auto_close_time: string; // HH:MM or HH:MM:SS
  open_order_strategy: "halt" | "autoclose";
}

const DEFAULTS: Settings = {
  auto_close_enabled: false,
  auto_close_time: "04:00",
  open_order_strategy: "halt",
};

export default function DayendSettingsCard({ venueId, venueTimezone }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("venue_dayend_settings")
        .select("auto_close_enabled, auto_close_time, open_order_strategy")
        .eq("venue_id", venueId)
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setSettings({
            auto_close_enabled: data.auto_close_enabled,
            auto_close_time: String(data.auto_close_time).slice(0, 5),
            open_order_strategy: data.open_order_strategy as Settings["open_order_strategy"],
          });
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("venue_dayend_settings").upsert({
      venue_id: venueId,
      auto_close_enabled: settings.auto_close_enabled,
      auto_close_time: settings.auto_close_time,
      open_order_strategy: settings.open_order_strategy,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dayend close settings saved");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Dayend Close Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-run dayend close</p>
                <p className="text-xs text-muted-foreground">
                  Closes the business day automatically at the time below
                  {venueTimezone ? ` (${venueTimezone.replace(/_/g, " ")} time)` : " (venue local time)"}.
                </p>
              </div>
              <Switch
                checked={settings.auto_close_enabled}
                onCheckedChange={(v) => setSettings({ ...settings, auto_close_enabled: v })}
              />
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="close_time" className="text-sm shrink-0">Run at</Label>
              <Input
                id="close_time"
                type="time"
                value={settings.auto_close_time}
                onChange={(e) => setSettings({ ...settings, auto_close_time: e.target.value })}
                className="w-32"
                disabled={!settings.auto_close_enabled}
              />
              <p className="text-xs text-muted-foreground">
                Checked every 10 minutes; typical venues close at 03:00–05:00,
                after the last late orders.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">If orders are still open at close</p>
              <RadioGroup
                value={settings.open_order_strategy}
                onValueChange={(v) =>
                  setSettings({ ...settings, open_order_strategy: v as Settings["open_order_strategy"] })
                }
                className="space-y-2"
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <RadioGroupItem value="halt" className="mt-0.5" />
                  <span>
                    <span className="text-sm font-medium text-foreground block">Halt the close</span>
                    <span className="text-xs text-muted-foreground">
                      The day stays open until staff resolve every open order.
                      Applies to the Close Day button and the auto-run alike.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <RadioGroupItem value="autoclose" className="mt-0.5" />
                  <span>
                    <span className="text-sm font-medium text-foreground block">
                      AutoClose to Internal Accounting
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Open orders are closed to the Internal Accounting payment
                      type and listed below, where they can be reopened and
                      settled to the correct payment — or voided.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
