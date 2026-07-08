import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  FEATURE_GROUPS,
  FeatureFlags,
  FeatureKey,
  PACKAGE_PRESETS,
  PackageTier,
  TIER_DESCRIPTION,
  TIER_LABEL,
  isCustomised,
  resolveFlags,
} from "@/lib/packages";

interface Props {
  venueId: string;
}

const SELECTABLE_TIERS: PackageTier[] = ["bite", "plate", "feast", "custom"];

export default function PackageFeaturesTab({ venueId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState<PackageTier>("feast");
  const [effective, setEffective] = useState<FeatureFlags>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("venue_feature_flags")
        .select("tier, flags")
        .eq("venue_id", venueId)
        .maybeSingle();
      const t = ((data?.tier as PackageTier) ?? "feast") as PackageTier;
      setTier(t);
      setEffective(resolveFlags(t, (data?.flags as FeatureFlags) ?? {}));
      setLoading(false);
    })();
  }, [venueId]);

  const customised = useMemo(
    () => (tier === "custom" ? true : isCustomised(tier, effective)),
    [tier, effective],
  );

  const applyPreset = (t: Exclude<PackageTier, "custom">) => {
    setTier(t);
    setEffective({ ...PACKAGE_PRESETS[t] });
  };

  const toggle = (key: FeatureKey, next: boolean) => {
    setEffective((prev) => {
      const merged = { ...prev, [key]: next };
      // Flip to "custom" if this diverges from the current preset
      if (tier !== "custom" && isCustomised(tier, merged)) setTier("custom");
      return merged;
    });
  };

  const save = async () => {
    setSaving(true);
    // Persist only the diff from the tier preset (or the full map if custom)
    const overrides: FeatureFlags = {};
    if (tier === "custom") {
      Object.assign(overrides, effective);
    } else {
      const preset = PACKAGE_PRESETS[tier];
      for (const g of FEATURE_GROUPS) {
        for (const f of g.features) {
          const k = f.key as FeatureKey;
          if (!!preset[k] !== !!effective[k]) overrides[k] = !!effective[k];
        }
      }
    }
    const { error } = await supabase
      .from("venue_feature_flags")
      .upsert(
        { venue_id: venueId, tier, flags: overrides as any },
        { onConflict: "venue_id" },
      );
    setSaving(false);
    if (error) {
      toast({ title: "Error saving package", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Package updated" });
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Package</CardTitle>
          <CardDescription>Pick a tier or start from a preset and customise below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SELECTABLE_TIERS.map((t) => {
              const selected = tier === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => (t === "custom" ? setTier("custom") : applyPreset(t))}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{TIER_LABEL[t]}</span>
                    {selected && customised && t !== "custom" && (
                      <Badge variant="outline" className="text-[10px]">modified</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{TIER_DESCRIPTION[t]}</p>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save package"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {FEATURE_GROUPS.map((group) => (
        <Card key={group.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {group.features.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-medium text-foreground">{f.label}</p>
                  {"note" in f && f.note && (
                    <p className="text-xs text-muted-foreground">{f.note}</p>
                  )}
                </div>
                <Switch
                  checked={!!effective[f.key as FeatureKey]}
                  onCheckedChange={(v) => toggle(f.key as FeatureKey, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
