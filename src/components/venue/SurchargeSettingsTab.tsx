import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CreditCard, Calendar, AlertTriangle, Clock, Info, Save, Plus, Trash2, Percent,
} from "lucide-react";

/* ── Types ── */

interface CardSurcharge {
  card_type: string;
  label: string;
  percent: number;
  enabled: boolean;
  rba_banned: boolean; // true = banned from Oct 1 2026
}

interface SpecialDate {
  id: string;
  label: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD (same as start for a single day)
}

interface TimeSurcharge {
  id: string;
  label: string;
  percent: number;
  enabled: boolean;
  days: number[]; // 0=Sun..6=Sat
  all_day: boolean;
  start_time: string;
  end_time: string;
  special_dates?: SpecialDate[]; // extra calendar dates the surcharge applies to
}

interface SurchargeConfig {
  enabled: boolean;
  card_surcharges: CardSurcharge[];
  time_surcharges: TimeSurcharge[];
  disclosure_text: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_CARD_SURCHARGES: CardSurcharge[] = [
  { card_type: "visa_debit", label: "Visa Debit", percent: 0, enabled: false, rba_banned: true },
  { card_type: "mastercard_debit", label: "Mastercard Debit", percent: 0, enabled: false, rba_banned: true },
  { card_type: "eftpos", label: "eftpos", percent: 0, enabled: false, rba_banned: true },
  { card_type: "visa_credit", label: "Visa Credit", percent: 0, enabled: false, rba_banned: true },
  { card_type: "mastercard_credit", label: "Mastercard Credit", percent: 0, enabled: false, rba_banned: true },
  { card_type: "amex", label: "American Express", percent: 1.5, enabled: false, rba_banned: false },
  { card_type: "diners", label: "Diners Club", percent: 1.5, enabled: false, rba_banned: false },
  { card_type: "corporate", label: "Corporate / Commercial Cards", percent: 1.0, enabled: false, rba_banned: false },
  { card_type: "foreign", label: "Foreign-Issued Cards", percent: 1.5, enabled: false, rba_banned: false },
  { card_type: "bnpl", label: "Buy Now Pay Later", percent: 2.0, enabled: false, rba_banned: false },
];

const DEFAULT_CONFIG: SurchargeConfig = {
  enabled: false,
  card_surcharges: DEFAULT_CARD_SURCHARGES,
  time_surcharges: [],
  disclosure_text: "A surcharge applies to certain payment methods and service times. See details at checkout.",
};

const RBA_BAN_DATE = new Date("2026-10-01");
const isBanActive = () => new Date() >= RBA_BAN_DATE;

export default function SurchargeSettingsTab({ venueId }: { venueId: string }) {
  const [config, setConfig] = useState<SurchargeConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("venues").select("settings").eq("id", venueId).single();
      const existing = (data?.settings as any)?.surcharges as SurchargeConfig | undefined;
      if (existing) {
        setConfig({
          ...DEFAULT_CONFIG,
          ...existing,
          card_surcharges: DEFAULT_CARD_SURCHARGES.map((def) => {
            const saved = existing.card_surcharges?.find((s) => s.card_type === def.card_type);
            return saved ? { ...def, ...saved, rba_banned: def.rba_banned } : def;
          }),
        });
      }
      setLoaded(true);
    })();
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    const { data: current } = await supabase.from("venues").select("settings").eq("id", venueId).single();
    const merged = { ...((current?.settings as any) || {}), surcharges: config };
    const { error } = await supabase.from("venues").update({ settings: merged }).eq("id", venueId);
    if (error) toast.error(error.message);
    else toast.success("Surcharge settings saved");
    setSaving(false);
  };

  const updateCardSurcharge = (index: number, patch: Partial<CardSurcharge>) => {
    setConfig((prev) => {
      const cards = [...prev.card_surcharges];
      cards[index] = { ...cards[index], ...patch };
      return { ...prev, card_surcharges: cards };
    });
  };

  const addTimeSurcharge = () => {
    setConfig((prev) => ({
      ...prev,
      time_surcharges: [
        ...prev.time_surcharges,
        {
          id: crypto.randomUUID(),
          label: "Weekend Surcharge",
          percent: 10,
          enabled: true,
          days: [0, 6], // Sat, Sun
          all_day: true,
          start_time: "00:00",
          end_time: "23:59",
          special_dates: [],
        },
      ],
    }));
  };

  const updateTimeSurcharge = (id: string, patch: Partial<TimeSurcharge>) => {
    setConfig((prev) => ({
      ...prev,
      time_surcharges: prev.time_surcharges.map((ts) =>
        ts.id === id ? { ...ts, ...patch } : ts
      ),
    }));
  };

  const removeTimeSurcharge = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      time_surcharges: prev.time_surcharges.filter((ts) => ts.id !== id),
    }));
  };

  const addSpecialDate = (surchargeId: string) => {
    const today = new Date().toISOString().split("T")[0];
    setConfig((prev) => ({
      ...prev,
      time_surcharges: prev.time_surcharges.map((ts) =>
        ts.id === surchargeId
          ? {
              ...ts,
              special_dates: [
                ...(ts.special_dates || []),
                { id: crypto.randomUUID(), label: "", start_date: today, end_date: today },
              ],
            }
          : ts
      ),
    }));
  };

  const updateSpecialDate = (surchargeId: string, dateId: string, patch: Partial<SpecialDate>) => {
    setConfig((prev) => ({
      ...prev,
      time_surcharges: prev.time_surcharges.map((ts) =>
        ts.id === surchargeId
          ? {
              ...ts,
              special_dates: (ts.special_dates || []).map((d) =>
                d.id === dateId ? { ...d, ...patch } : d
              ),
            }
          : ts
      ),
    }));
  };

  const removeSpecialDate = (surchargeId: string, dateId: string) => {
    setConfig((prev) => ({
      ...prev,
      time_surcharges: prev.time_surcharges.map((ts) =>
        ts.id === surchargeId
          ? { ...ts, special_dates: (ts.special_dates || []).filter((d) => d.id !== dateId) }
          : ts
      ),
    }));
  };

  const toggleDay = (surchargeId: string, day: number) => {
    setConfig((prev) => ({
      ...prev,
      time_surcharges: prev.time_surcharges.map((ts) => {
        if (ts.id !== surchargeId) return ts;
        const days = ts.days.includes(day)
          ? ts.days.filter((d) => d !== day)
          : [...ts.days, day].sort();
        return { ...ts, days };
      }),
    }));
  };

  if (!loaded) return <p className="text-muted-foreground">Loading...</p>;

  const banActive = isBanActive();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Master toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Surcharging
              </CardTitle>
              <CardDescription>
                Apply card-type surcharges and time-based surcharges (weekends, public holidays, late night) to orders. Surcharges are disclosed to diners at checkout.
              </CardDescription>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
            />
          </div>
        </CardHeader>
      </Card>

      {config.enabled && (
        <>
          {/* RBA Notice */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">RBA Surcharging Ban — 1 October 2026</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The Reserve Bank of Australia has banned surcharging on consumer debit and credit cards (Visa, Mastercard, eftpos) from 1 October 2026.
                    Card types marked with <Badge variant="outline" className="text-xs px-1 py-0 mx-0.5 border-amber-500/50 text-amber-600">RBA banned</Badge> below
                    {banActive
                      ? " are currently prohibited from being surcharged."
                      : " will be automatically disabled on that date."}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Unaffected:</strong> American Express (merchant-issued), Diners Club, corporate/commercial cards, foreign-issued cards, BNPL, and all time-based surcharges (weekends, public holidays, late night).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Card-Type Surcharges ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Card-Type Surcharges</CardTitle>
                  <CardDescription>
                    Apply a percentage surcharge based on the payment card type. Only enable surcharges permitted under Australian consumer law.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {config.card_surcharges.map((cs, i) => {
                const isBanned = cs.rba_banned && banActive;
                return (
                  <div
                    key={cs.card_type}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      isBanned ? "border-border bg-muted/50 opacity-60" : "border-border"
                    }`}
                  >
                    <Switch
                      checked={cs.enabled && !isBanned}
                      disabled={isBanned}
                      onCheckedChange={(v) => updateCardSurcharge(i, { enabled: v })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{cs.label}</p>
                        {cs.rba_banned && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-500/50 text-amber-600">
                            {banActive ? "RBA banned" : "Banned from Oct 2026"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="w-20 shrink-0">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={cs.percent}
                          disabled={isBanned}
                          onChange={(e) =>
                            updateCardSurcharge(i, { percent: parseFloat(e.target.value) || 0 })
                          }
                          className="pr-7 text-sm"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-2 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Under Australian Consumer Law, surcharges must not exceed the cost of acceptance for each card type. Excessive surcharging is illegal.
              </p>
            </CardContent>
          </Card>

          {/* ── Time-Based Surcharges ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Time-Based Surcharges</CardTitle>
                    <CardDescription>
                      Apply surcharges for weekends, public holidays, or late-night service. These are operational surcharges and are not affected by the RBA card surcharging ban.
                    </CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={addTimeSurcharge}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.time_surcharges.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No time-based surcharges configured. Common examples: weekend surcharge (10–15%), public holiday surcharge (15%), late-night surcharge.
                </p>
              )}
              {config.time_surcharges.map((ts) => (
                <div key={ts.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={ts.enabled}
                      onCheckedChange={(v) => updateTimeSurcharge(ts.id, { enabled: v })}
                    />
                    <div className="flex-1">
                      <Input
                        value={ts.label}
                        onChange={(e) => updateTimeSurcharge(ts.id, { label: e.target.value })}
                        placeholder="e.g. Weekend Surcharge"
                        className="text-sm font-medium"
                      />
                    </div>
                    <div className="w-20 shrink-0">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={ts.percent}
                          onChange={(e) =>
                            updateTimeSurcharge(ts.id, { percent: parseFloat(e.target.value) || 0 })
                          }
                          className="pr-7 text-sm"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeTimeSurcharge(ts.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Day selection */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Active days</Label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, dayIndex) => (
                        <button
                          key={dayIndex}
                          onClick={() => toggleDay(ts.id, dayIndex)}
                          className={`h-8 w-10 rounded-md text-xs font-medium transition-colors ${
                            ts.days.includes(dayIndex)
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Special dates */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs text-muted-foreground">Special dates</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Apply this surcharge on specific dates regardless of the day of week — e.g. public holidays, Grand Prix weekend, NYE.
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => addSpecialDate(ts.id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add date
                      </Button>
                    </div>
                    {(ts.special_dates || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">No special dates added.</p>
                    ) : (
                      <div className="space-y-2">
                        {(ts.special_dates || []).map((d) => (
                          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
                            <Input
                              value={d.label}
                              onChange={(e) => updateSpecialDate(ts.id, d.id, { label: e.target.value })}
                              placeholder="e.g. Grand Prix"
                              className="h-8 text-sm flex-1 min-w-[140px]"
                            />
                            <Input
                              type="date"
                              value={d.start_date}
                              onChange={(e) => {
                                const start = e.target.value;
                                updateSpecialDate(ts.id, d.id, {
                                  start_date: start,
                                  end_date: d.end_date && d.end_date >= start ? d.end_date : start,
                                });
                              }}
                              className="h-8 w-[150px] text-sm"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input
                              type="date"
                              min={d.start_date}
                              value={d.end_date}
                              onChange={(e) => updateSpecialDate(ts.id, d.id, { end_date: e.target.value })}
                              className="h-8 w-[150px] text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeSpecialDate(ts.id, d.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time range */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ts.all_day}
                        onCheckedChange={(v) => updateTimeSurcharge(ts.id, { all_day: v })}
                      />
                      <Label className="text-xs">All day</Label>
                    </div>
                    {!ts.all_day && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="time"
                          value={ts.start_time}
                          onChange={(e) => updateTimeSurcharge(ts.id, { start_time: e.target.value })}
                          className="w-28 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={ts.end_time}
                          onChange={(e) => updateTimeSurcharge(ts.id, { end_time: e.target.value })}
                          className="w-28 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── Disclosure Text ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Disclosure
              </CardTitle>
              <CardDescription>
                This text is shown to diners at checkout when a surcharge applies. Australian Consumer Law requires clear disclosure of any surcharges before payment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={config.disclosure_text}
                onChange={(e) => setConfig((c) => ({ ...c, disclosure_text: e.target.value }))}
                placeholder="Surcharge disclosure text..."
              />
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Surcharge Settings"}
          </Button>
        </>
      )}
    </div>
  );
}
