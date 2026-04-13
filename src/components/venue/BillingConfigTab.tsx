import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface BillingConfigTabProps {
  venueId: string;
  venueType: string;
  groupId: string | null;
  groupName?: string;
  childVenues?: { id: string; name: string }[];
}

interface BillingConfig {
  commission_percent: number;
  min_monthly_fee: number;
  billing_currency: string;
  inherit_from_group: boolean;
  notes: string;
}

const defaultConfig: BillingConfig = {
  commission_percent: 0,
  min_monthly_fee: 0,
  billing_currency: "AUD",
  inherit_from_group: true,
  notes: "",
};

export default function BillingConfigTab({ venueId, venueType, groupId, groupName, childVenues }: BillingConfigTabProps) {
  const [config, setConfig] = useState<BillingConfig>(defaultConfig);
  const [parentConfig, setParentConfig] = useState<BillingConfig | null>(null);
  const [childConfigs, setChildConfigs] = useState<Record<string, BillingConfig & { exists: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [venueId]);

  const fetchConfig = async () => {
    setLoading(true);

    // Fetch this venue's billing config
    const { data } = await supabase
      .from("venue_billing_config")
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle();

    if (data) {
      setHasExisting(true);
      setConfig({
        commission_percent: Number(data.commission_percent),
        min_monthly_fee: Number(data.min_monthly_fee),
        billing_currency: data.billing_currency,
        inherit_from_group: data.inherit_from_group,
        notes: data.notes || "",
      });
    } else {
      setHasExisting(false);
      setConfig(defaultConfig);
    }

    // If child venue with a group, fetch parent venue's config for inheritance display
    if (venueType !== "parent" && groupId) {
      const { data: parentVenue } = await supabase
        .from("venues")
        .select("id")
        .eq("group_id", groupId)
        .eq("venue_type", "parent")
        .maybeSingle();

      if (parentVenue) {
        const { data: pConfig } = await supabase
          .from("venue_billing_config")
          .select("*")
          .eq("venue_id", parentVenue.id)
          .maybeSingle();

        if (pConfig) {
          setParentConfig({
            commission_percent: Number(pConfig.commission_percent),
            min_monthly_fee: Number(pConfig.min_monthly_fee),
            billing_currency: pConfig.billing_currency,
            inherit_from_group: pConfig.inherit_from_group,
            notes: pConfig.notes || "",
          });
        }
      }
    }

    // If parent venue, fetch child configs
    if (venueType === "parent" && childVenues && childVenues.length > 0) {
      const childIds = childVenues.map((c) => c.id);
      const { data: cConfigs } = await supabase
        .from("venue_billing_config")
        .select("*")
        .in("venue_id", childIds);

      const map: Record<string, BillingConfig & { exists: boolean }> = {};
      for (const cv of childVenues) {
        const cc = cConfigs?.find((c) => c.venue_id === cv.id);
        map[cv.id] = cc
          ? { commission_percent: Number(cc.commission_percent), min_monthly_fee: Number(cc.min_monthly_fee), billing_currency: cc.billing_currency, inherit_from_group: cc.inherit_from_group, notes: cc.notes || "", exists: true }
          : { ...defaultConfig, exists: false };
      }
      setChildConfigs(map);
    }

    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    if (hasExisting) {
      const { error } = await supabase
        .from("venue_billing_config")
        .update({
          commission_percent: config.commission_percent,
          min_monthly_fee: config.min_monthly_fee,
          billing_currency: config.billing_currency,
          inherit_from_group: config.inherit_from_group,
          notes: config.notes || null,
        })
        .eq("venue_id", venueId);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Billing config updated" });
    } else {
      const { error } = await supabase
        .from("venue_billing_config")
        .insert({
          venue_id: venueId,
          commission_percent: config.commission_percent,
          min_monthly_fee: config.min_monthly_fee,
          billing_currency: config.billing_currency,
          inherit_from_group: config.inherit_from_group,
          notes: config.notes || null,
        });
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else {
        toast({ title: "Billing config created" });
        setHasExisting(true);
      }
    }
    setSaving(false);
  };

  const isInheriting = config.inherit_from_group && groupId && venueType !== "parent" && parentConfig;
  const effectiveCommission = isInheriting ? parentConfig!.commission_percent : config.commission_percent;
  const effectiveFee = isInheriting ? parentConfig!.min_monthly_fee : config.min_monthly_fee;

  if (loading) return <p className="text-muted-foreground">Loading billing config...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{venueType === "parent" ? "Group Default Billing" : "Billing Configuration"}</CardTitle>
          <CardDescription>
            {venueType === "parent"
              ? "Set the default commission and fees for all child venues in this group."
              : "Commission is calculated on ticket totals excluding tax."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inherit toggle — only for child venues with a group */}
          {venueType !== "parent" && groupId && parentConfig && (
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Inherit from {groupName || "parent group"}</p>
                <p className="text-xs text-muted-foreground">
                  Group defaults: {parentConfig.commission_percent}% commission, ${parentConfig.min_monthly_fee.toFixed(2)}/mo
                </p>
              </div>
              <Switch
                checked={config.inherit_from_group}
                onCheckedChange={(v) => setConfig({ ...config, inherit_from_group: v })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Commission Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={isInheriting ? effectiveCommission : config.commission_percent}
                onChange={(e) => setConfig({ ...config, commission_percent: parseFloat(e.target.value) || 0 })}
                disabled={!!isInheriting}
                className={`mt-1 ${isInheriting ? "opacity-50" : ""}`}
              />
              {isInheriting && <p className="text-xs text-muted-foreground mt-1">Inherited from group</p>}
            </div>
            <div>
              <Label>Min Monthly Fee ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={isInheriting ? effectiveFee : config.min_monthly_fee}
                onChange={(e) => setConfig({ ...config, min_monthly_fee: parseFloat(e.target.value) || 0 })}
                disabled={!!isInheriting}
                className={`mt-1 ${isInheriting ? "opacity-50" : ""}`}
              />
              {isInheriting && <p className="text-xs text-muted-foreground mt-1">Inherited from group</p>}
            </div>
          </div>

          <div>
            <Label>Admin Notes</Label>
            <Textarea
              value={config.notes}
              onChange={(e) => setConfig({ ...config, notes: e.target.value })}
              placeholder="Internal notes about billing terms, discounts, etc..."
              className="mt-1"
            />
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Billing Config"}
          </Button>
        </CardContent>
      </Card>

      {/* Parent venue: show child venue billing overview */}
      {venueType === "parent" && childVenues && childVenues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Child Venue Billing</CardTitle>
            <CardDescription>Overview of billing configuration for each child venue.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {childVenues.map((cv) => {
                const cc = childConfigs[cv.id];
                const inherits = !cc?.exists || cc?.inherit_from_group;
                const rate = inherits ? config.commission_percent : cc?.commission_percent ?? 0;
                const fee = inherits ? config.min_monthly_fee : cc?.min_monthly_fee ?? 0;
                return (
                  <div key={cv.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{cv.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {rate}% · ${fee.toFixed(2)}/mo
                      </p>
                    </div>
                    <Badge variant={inherits ? "secondary" : "outline"}>
                      {inherits ? "Inherited" : "Override"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
