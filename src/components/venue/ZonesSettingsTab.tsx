import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  MapPin, Plus, Trash2, ShieldCheck, SplitSquareHorizontal, UtensilsCrossed, ChevronUp, ChevronDown,
  Store, HandPlatter, MessageSquare, Bell, Building2,
} from "lucide-react";

type ServiceMode = "inherit" | "table_delivery" | "counter_pickup";
type PaymentTiming = "at_order" | "at_end";

export interface VenueZone {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  color: string;
  display_order: number;
  is_active: boolean;
  menu_id: string | null;
  tabs_enabled: boolean;
  payment_override: boolean;
  require_preauth: boolean;
  preauth_amount: number;
  max_tab_amount: number | null;
  allow_split_payments: boolean;
  service_mode: ServiceMode;
  pickup_location_label: string | null;
  notify_sms_on_ready: boolean;
  notify_inapp_on_ready: boolean;
}

interface MenuOption {
  id: string;
  name: string;
}

interface VenueDefaults {
  default_service_mode: "table_delivery" | "counter_pickup";
  default_pickup_location: string | null;
  default_payment_timing: PaymentTiming;
}

const NO_MENU = "__none__";

export default function ZonesSettingsTab({ venueId }: { venueId: string }) {
  const [zones, setZones] = useState<VenueZone[]>([]);
  const [menus, setMenus] = useState<MenuOption[]>([]);
  const [venueDefaults, setVenueDefaults] = useState<VenueDefaults>({
    default_service_mode: "table_delivery",
    default_pickup_location: null,
    default_payment_timing: "at_order",
  });
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [unzonedTables, setUnzonedTables] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [zonesRes, menusRes, tablesRes, venueRes] = await Promise.all([
      supabase.from("venue_zones").select("*").eq("venue_id", venueId).order("display_order"),
      supabase.from("venue_menus").select("id, name").eq("venue_id", venueId).order("display_order"),
      supabase.from("tables").select("id, zone_id").eq("venue_id", venueId),
      supabase.from("venues")
        .select("default_service_mode, default_pickup_location, default_payment_timing")
        .eq("id", venueId).maybeSingle(),
    ]);
    setZones(((zonesRes.data as any[]) || []).map((z) => ({
      ...z,
      preauth_amount: Number(z.preauth_amount ?? 50),
      max_tab_amount: z.max_tab_amount === null ? null : Number(z.max_tab_amount),
      service_mode: (z.service_mode ?? "inherit") as ServiceMode,
      payment_override: !!z.payment_override,
      notify_sms_on_ready: z.notify_sms_on_ready !== false,
      notify_inapp_on_ready: z.notify_inapp_on_ready !== false,
    })) as VenueZone[]);
    setMenus(((menusRes.data as any[]) || []) as MenuOption[]);
    const v = venueRes.data as any;
    if (v) {
      setVenueDefaults({
        default_service_mode: (v.default_service_mode ?? "table_delivery"),
        default_pickup_location: v.default_pickup_location ?? null,
        default_payment_timing: (v.default_payment_timing ?? "at_order"),
      });
    }

    const counts: Record<string, number> = {};
    let unzoned = 0;
    for (const t of (tablesRes.data as any[]) || []) {
      if (!t.zone_id) unzoned++;
      else counts[t.zone_id] = (counts[t.zone_id] || 0) + 1;
    }
    setTableCounts(counts);
    setUnzonedTables(unzoned);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { load(); }, [load]);

  const patch = (id: string, changes: Partial<VenueZone>) =>
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...changes } : z)));

  const saveVenueDefaults = async () => {
    setSavingVenue(true);
    const { error } = await supabase
      .from("venues")
      .update({
        default_service_mode: venueDefaults.default_service_mode,
        default_pickup_location: venueDefaults.default_pickup_location,
        default_payment_timing: venueDefaults.default_payment_timing,
      } as any)
      .eq("id", venueId);
    setSavingVenue(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Venue-wide defaults saved");
  };

  const addZone = async () => {
    const name = newZoneName.trim();
    if (!name) return;
    const { error } = await supabase.from("venue_zones").insert({
      venue_id: venueId,
      name,
      display_order: zones.length,
      menu_id: menus[0]?.id ?? null,
    } as any);
    if (error) { toast.error(error.message); return; }
    setNewZoneName("");
    toast.success(`Zone "${name}" added`);
    load();
  };

  const deleteZone = async (zone: VenueZone) => {
    const count = tableCounts[zone.id] || 0;
    if (!confirm(
      count > 0
        ? `Delete "${zone.name}"? ${count} table${count === 1 ? "" : "s"} will have no zone and fall back to the venue-wide settings.`
        : `Delete zone "${zone.name}"?`
    )) return;
    const { error } = await supabase.from("venue_zones").delete().eq("id", zone.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Zone deleted");
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= zones.length) return;
    const next = [...zones];
    [next[index], next[target]] = [next[target], next[index]];
    setZones(next.map((z, i) => ({ ...z, display_order: i })));
    await Promise.all(
      next.map((z, i) => supabase.from("venue_zones").update({ display_order: i }).eq("id", z.id))
    );
  };

  const saveAll = async () => {
    setSaving(true);
    let failed = false;
    for (const z of zones) {
      const { error } = await supabase
        .from("venue_zones")
        .update({
          name: z.name.trim(),
          description: z.description,
          color: z.color,
          is_active: z.is_active,
          menu_id: z.menu_id,
          payment_override: z.payment_override,
          tabs_enabled: z.tabs_enabled,
          require_preauth: z.require_preauth,
          preauth_amount: z.preauth_amount || 0,
          max_tab_amount: z.max_tab_amount,
          allow_split_payments: z.allow_split_payments,
          service_mode: z.service_mode,
          pickup_location_label: z.pickup_location_label,
          notify_sms_on_ready: z.notify_sms_on_ready,
          notify_inapp_on_ready: z.notify_inapp_on_ready,
        } as any)
        .eq("id", z.id);
      if (error) { toast.error(`${z.name}: ${error.message}`); failed = true; }
    }
    if (!failed) toast.success("Zones saved");
    setSaving(false);
    load();
  };

  const venueServiceLabel = venueDefaults.default_service_mode === "counter_pickup"
    ? "Collect at counter"
    : "Brought to table";
  const venuePaymentLabel = venueDefaults.default_payment_timing === "at_end"
    ? "Pay at the end (tab)"
    : "Pay at order";

  const effectiveServiceLabel = (z: VenueZone) =>
    z.service_mode === "inherit"
      ? `Venue default — ${venueServiceLabel}`
      : z.service_mode === "counter_pickup" ? "Collect at counter" : "Brought to table";

  const effectivePickup = (z: VenueZone) =>
    (z.pickup_location_label || venueDefaults.default_pickup_location || "the counter");

  const zoneIsPickup = (z: VenueZone) =>
    z.service_mode === "counter_pickup"
    || (z.service_mode === "inherit" && venueDefaults.default_service_mode === "counter_pickup");

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Venue-wide defaults ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Venue-wide defaults
          </CardTitle>
          <CardDescription>
            These apply to the <strong>whole venue</strong> — every table, including tables with no
            zone. If one area of the venue works differently, set up a zone below and switch that
            zone to override these defaults. Zones always win over the venue-wide setting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <HandPlatter className="h-3.5 w-3.5" /> How food reaches the diner
              </Label>
              <Select
                value={venueDefaults.default_service_mode}
                onValueChange={(v) =>
                  setVenueDefaults((d) => ({ ...d, default_service_mode: v as VenueDefaults["default_service_mode"] }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="table_delivery">Brought to the table</SelectItem>
                  <SelectItem value="counter_pickup">Diner collects at the counter</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick "collects" if you don't run food to tables — diners are told where to collect
                and get a text plus an in-app alert when their order is ready.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Default collection point</Label>
              <Input
                placeholder="e.g. Main Bar, Hostess stand"
                value={venueDefaults.default_pickup_location ?? ""}
                onChange={(e) =>
                  setVenueDefaults((d) => ({ ...d, default_pickup_location: e.target.value || null }))
                }
                disabled={venueDefaults.default_service_mode !== "counter_pickup"}
              />
              <p className="text-xs text-muted-foreground">
                Shown to the diner and used in the "order ready" text.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">When diners pay (venue-wide)</Label>
            <Select
              value={venueDefaults.default_payment_timing}
              onValueChange={(v) => setVenueDefaults((d) => ({ ...d, default_payment_timing: v as PaymentTiming }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="at_order">Pay at order — every round is paid up front</SelectItem>
                <SelectItem value="at_end">Pay at the end — diners run a tab and settle once</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This is the whole-venue rule. Zones that don't override it follow this setting.
            </p>
          </div>

          <Button onClick={saveVenueDefaults} disabled={savingVenue}>
            {savingVenue ? "Saving..." : "Save venue defaults"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Zones ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Zones
          </CardTitle>
          <CardDescription>
            Zones are the outlets in your venue — Main Bar, Bistro, Rooftop. Each zone serves one
            menu, can be assigned to tables when you create QR codes, and can <strong>override</strong>{" "}
            the venue-wide service and payment rules above when that area works differently.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <Input
              placeholder="New zone name (e.g. Rooftop Bar)"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addZone(); }}
            />
            <Button onClick={addZone} disabled={!newZoneName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add zone
            </Button>
          </div>

          {zones.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No zones yet. Every table runs on the venue-wide defaults above. Add your first zone
              here, then assign it to tables in Tables &amp; QR.
            </p>
          )}

          {zones.map((z, i) => (
            <div key={z.id} className="space-y-4">
              {i > 0 && <Separator />}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: z.color }}
                  />
                  <p className="font-semibold truncate">{z.name}</p>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {tableCounts[z.id] || 0} table{(tableCounts[z.id] || 0) === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant={zoneIsPickup(z) ? "default" : "outline"} className="text-[10px] shrink-0">
                    {zoneIsPickup(z) ? "Collect at counter" : "Table service"}
                  </Badge>
                  <Badge variant={z.payment_override ? "default" : "outline"} className="text-[10px] shrink-0">
                    {z.payment_override
                      ? (z.tabs_enabled ? "Tabs (zone rule)" : "Pay on order (zone rule)")
                      : `Venue-wide — ${venuePaymentLabel}`}
                  </Badge>
                  {!z.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === zones.length - 1}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteZone(z)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="details" className="pl-1">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="menu">Menu</TabsTrigger>
                  <TabsTrigger value="service">Service</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-3 pt-3">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Zone name</Label>
                      <Input value={z.name} onChange={(e) => patch(z.id, { name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Colour</Label>
                      <Input
                        type="color"
                        className="h-10 w-20 p-1"
                        value={z.color}
                        onChange={(e) => patch(z.id, { color: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Description</Label>
                    <Textarea
                      rows={2}
                      placeholder="What this area is — e.g. table service bistro, 120 seats"
                      value={z.description ?? ""}
                      onChange={(e) => patch(z.id, { description: e.target.value || null })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                    <div>
                      <p className="text-sm font-medium">Zone active</p>
                      <p className="text-xs text-muted-foreground">
                        Turn off to stop diners ordering from tables in this zone.
                      </p>
                    </div>
                    <Switch checked={z.is_active} onCheckedChange={(v) => patch(z.id, { is_active: v })} />
                  </div>
                </TabsContent>

                <TabsContent value="menu" className="space-y-2 pt-3">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <UtensilsCrossed className="h-3.5 w-3.5" /> Menu served in this zone
                  </Label>
                  <Select
                    value={z.menu_id ?? NO_MENU}
                    onValueChange={(v) => patch(z.id, { menu_id: v === NO_MENU ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose a menu" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MENU}>No menu assigned</SelectItem>
                      {menus.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Diners scanning a table in this zone see this menu. Create and edit menus in Menu
                    Builder — one menu can be shared by several zones.
                  </p>
                </TabsContent>

                <TabsContent value="service" className="space-y-4 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5" /> How food reaches the diner
                    </Label>
                    <Select
                      value={z.service_mode}
                      onValueChange={(v) => patch(z.id, { service_mode: v as ServiceMode })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Use venue-wide default ({venueServiceLabel})</SelectItem>
                        <SelectItem value="table_delivery">Brought to the table</SelectItem>
                        <SelectItem value="counter_pickup">Diner collects at the counter</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Currently: <strong>{effectiveServiceLabel(z)}</strong>
                    </p>
                  </div>

                  {zoneIsPickup(z) && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold">Collection point</Label>
                        <Input
                          placeholder={venueDefaults.default_pickup_location || "e.g. Main Bar, Hostess stand"}
                          value={z.pickup_location_label ?? ""}
                          onChange={(e) => patch(z.id, { pickup_location_label: e.target.value || null })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Diners are told to collect at <strong>{effectivePickup(z)}</strong>. Leave
                          blank to use the venue default.
                        </p>
                      </div>

                      <div className="flex items-start justify-between gap-4 rounded-xl bg-muted/40 p-3">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" /> Text the diner when the order is ready
                          </p>
                          <p className="text-xs text-muted-foreground">
                            When staff mark an order Ready, we SMS the diner: "your order is ready —
                            collect it at {effectivePickup(z)}".
                          </p>
                        </div>
                        <Switch
                          checked={z.notify_sms_on_ready}
                          onCheckedChange={(v) => patch(z.id, { notify_sms_on_ready: v })}
                        />
                      </div>

                      <div className="flex items-start justify-between gap-4 rounded-xl bg-muted/40 p-3">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5" /> In-app alert when the order is ready
                          </p>
                          <p className="text-xs text-muted-foreground">
                            The diner app shows a collection banner on the order tracker.
                          </p>
                        </div>
                        <Switch
                          checked={z.notify_inapp_on_ready}
                          onCheckedChange={(v) => patch(z.id, { notify_inapp_on_ready: v })}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="payments" className="space-y-4 pt-3">
                  <div className="flex items-start justify-between gap-4 rounded-xl bg-muted/40 p-3">
                    <div>
                      <p className="text-sm font-medium">Override the venue-wide payment setting</p>
                      <p className="text-xs text-muted-foreground">
                        {z.payment_override
                          ? "This zone uses its own payment rules below."
                          : `Off — this zone follows the venue-wide setting: ${venuePaymentLabel}.`}
                      </p>
                    </div>
                    <Switch
                      checked={z.payment_override}
                      onCheckedChange={(v) => patch(z.id, { payment_override: v })}
                    />
                  </div>

                  {z.payment_override && (
                    <>
                      <div className="flex items-start justify-between gap-4 rounded-xl bg-muted/40 p-3">
                        <div>
                          <p className="text-sm font-medium">Allow open tabs in this zone</p>
                          <p className="text-xs text-muted-foreground">
                            {z.tabs_enabled
                              ? "Diners can add rounds to a tab and settle at the end."
                              : "Pay at order — every round is paid up front."}
                          </p>
                        </div>
                        <Switch checked={z.tabs_enabled} onCheckedChange={(v) => patch(z.id, { tabs_enabled: v })} />
                      </div>

                      {z.tabs_enabled && (
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-xl bg-muted/40 p-3">
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
                              checked={z.require_preauth}
                              onCheckedChange={(v) => patch(z.id, { require_preauth: v })}
                            />
                          </div>

                          {z.require_preauth && (
                            <div className="space-y-1.5">
                              <Label className="text-sm font-semibold">Pre-auth amount ($)</Label>
                              <Input
                                type="number" min={0} step="1"
                                value={z.preauth_amount}
                                onChange={(e) => patch(z.id, { preauth_amount: Math.max(0, Number(e.target.value) || 0) })}
                              />
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <Label className="text-sm font-semibold">Tab limit ($)</Label>
                            <Input
                              type="number" min={0} step="10" placeholder="No limit"
                              value={z.max_tab_amount ?? ""}
                              onChange={(e) =>
                                patch(z.id, { max_tab_amount: e.target.value === "" ? null : Number(e.target.value) })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Diners must settle before ordering past this amount. Blank for no limit.
                            </p>
                          </div>

                          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-xl bg-muted/40 p-3">
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
                              checked={z.allow_split_payments}
                              onCheckedChange={(v) => patch(z.id, { allow_split_payments: v })}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ))}

          {unzonedTables > 0 && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              {unzonedTables} table{unzonedTables === 1 ? " has" : "s have"} no zone assigned — those
              tables run entirely on the venue-wide defaults ({venueServiceLabel}, {venuePaymentLabel})
              and show the venue's default menu. Set a zone on them in Tables &amp; QR.
            </p>
          )}

          {zones.length > 0 && (
            <Button onClick={saveAll} disabled={saving}>
              {saving ? "Saving..." : "Save zones"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
