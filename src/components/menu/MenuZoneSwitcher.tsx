import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, MapPin, Plus, Settings2, Trash2, UtensilsCrossed } from "lucide-react";

export interface VenueMenu {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  active_days: number[];
  start_time: string | null;
  end_time: string | null;
}

export interface ZoneRef {
  id: string;
  name: string;
  color: string;
  menu_id: string | null;
  is_active: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleLabel(m: VenueMenu) {
  const days =
    m.active_days.length === 7
      ? "Every day"
      : m.active_days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DAYS[d])
          .join(", ");
  const times =
    m.start_time || m.end_time
      ? ` · ${(m.start_time || "00:00").slice(0, 5)}–${(m.end_time || "23:59").slice(0, 5)}`
      : " · All day";
  return `${days}${times}`;
}

interface Props {
  venueId: string;
  menus: VenueMenu[];
  zones: ZoneRef[];
  activeMenuId: string | null;
  onSelect: (menuId: string) => void;
  onChanged: () => void;
  readOnly?: boolean;
}

export default function MenuZoneSwitcher({
  venueId, menus, zones, activeMenuId, onSelect, onChanged, readOnly,
}: Props) {
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<VenueMenu | null>(null);
  const [draft, setDraft] = useState<Partial<VenueMenu>>({});
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const activeMenu = menus.find((m) => m.id === activeMenuId) || null;
  const zonesForActive = zones.filter((z) => z.menu_id === activeMenuId);

  const openEdit = useCallback((m: VenueMenu) => {
    setEditing(m);
    setDraft({ ...m });
  }, []);

  useEffect(() => {
    if (!manageOpen) { setEditing(null); setDraft({}); }
  }, [manageOpen]);

  const createMenu = async () => {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("venue_menus")
      .insert({ venue_id: venueId, name, display_order: menus.length } as any)
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    setNewName("");
    toast.success(`Menu "${name}" created`);
    onChanged();
    if (data?.id) onSelect(data.id);
  };

  const saveMenu = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("venue_menus")
      .update({
        name: (draft.name || editing.name).trim(),
        description: draft.description ?? null,
        is_active: draft.is_active ?? true,
        active_days: draft.active_days ?? [0, 1, 2, 3, 4, 5, 6],
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
      } as any)
      .eq("id", editing.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Menu updated");
    setEditing(null);
    onChanged();
  };

  const deleteMenu = async (m: VenueMenu) => {
    if (!confirm(`Delete "${m.name}"? Its categories and their items are removed from the app.`)) return;
    const { error } = await supabase.from("venue_menus").delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Menu deleted");
    setEditing(null);
    onChanged();
  };

  const toggleDay = (d: number) => {
    const days = new Set(draft.active_days ?? []);
    if (days.has(d)) days.delete(d); else days.add(d);
    setDraft((s) => ({ ...s, active_days: Array.from(days).sort((a, b) => a - b) }));
  };

  return (
    <>
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Menu</span>
          </div>

          <Select value={activeMenuId ?? undefined} onValueChange={onSelect}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a menu" />
            </SelectTrigger>
            <SelectContent>
              {menus.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}{m.is_active ? "" : " (inactive)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {zones.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {zonesForActive.length === 0 ? (
                <span className="text-xs text-muted-foreground">Not assigned to a zone yet</span>
              ) : (
                zonesForActive.map((z) => (
                  <Badge
                    key={z.id}
                    variant="outline"
                    className="text-[10px]"
                    style={{ borderColor: `${z.color}66`, backgroundColor: `${z.color}18` }}
                  >
                    {z.name}
                  </Badge>
                ))
              )}
            </div>
          )}

          {activeMenu && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {scheduleLabel(activeMenu)}
            </span>
          )}

          {!readOnly && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setManageOpen(true)}>
              <Settings2 className="h-3.5 w-3.5 mr-1" /> Manage menus
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Menus</DialogTitle></DialogHeader>

          <div className="flex gap-2">
            <Input
              placeholder="New menu name (e.g. Bar Snacks, Lunch)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createMenu(); }}
            />
            <Button onClick={createMenu} disabled={!newName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Create
            </Button>
          </div>

          <div className="space-y-2 max-h-[45vh] overflow-y-auto">
            {menus.map((m) => {
              const zs = zones.filter((z) => z.menu_id === m.id);
              return (
                <div key={m.id} className="rounded-xl border border-border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {m.name}{!m.is_active && <span className="text-muted-foreground"> (inactive)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{scheduleLabel(m)}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {zs.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">No zones</span>
                        ) : zs.map((z) => (
                          <Badge key={z.id} variant="secondary" className="text-[10px]">{z.name}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => (editing?.id === m.id ? setEditing(null) : openEdit(m))}>
                        {editing?.id === m.id ? "Close" : "Edit"}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMenu(m)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {editing?.id === m.id && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold">Name</Label>
                        <Input
                          value={draft.name ?? ""}
                          onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold">Description</Label>
                        <Textarea
                          rows={2}
                          value={draft.description ?? ""}
                          onChange={(e) => setDraft((s) => ({ ...s, description: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold">Active days</Label>
                        <div className="flex gap-1.5 flex-wrap">
                          {DAYS.map((d, i) => {
                            const on = (draft.active_days ?? []).includes(i);
                            return (
                              <Badge
                                key={d}
                                variant={on ? "default" : "outline"}
                                className="cursor-pointer select-none"
                                onClick={() => toggleDay(i)}
                              >
                                {d}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold">Starts</Label>
                          <Input
                            type="time"
                            value={(draft.start_time ?? "").slice(0, 5)}
                            onChange={(e) => setDraft((s) => ({ ...s, start_time: e.target.value || null }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold">Ends</Label>
                          <Input
                            type="time"
                            value={(draft.end_time ?? "").slice(0, 5)}
                            onChange={(e) => setDraft((s) => ({ ...s, end_time: e.target.value || null }))}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Leave times blank for an all-day menu.
                      </p>
                      <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                        <div>
                          <p className="text-sm font-medium">Menu active</p>
                          <p className="text-xs text-muted-foreground">Hide this menu from diners without deleting it.</p>
                        </div>
                        <Switch
                          checked={draft.is_active ?? true}
                          onCheckedChange={(v) => setDraft((s) => ({ ...s, is_active: v }))}
                        />
                      </div>
                      <Button onClick={saveMenu} disabled={saving}>
                        {saving ? "Saving..." : "Save menu"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {menus.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No menus yet — create one above, then assign it to a zone in Settings → Zones.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
