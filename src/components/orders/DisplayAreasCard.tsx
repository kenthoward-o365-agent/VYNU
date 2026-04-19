import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";

interface DisplayArea {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  color: string;
  display_order: number;
  is_active: boolean;
  is_default: boolean;
}

const PRESET_COLORS = [
  "#F59E0B", "#8B5CF6", "#10B981", "#3B82F6",
  "#EF4444", "#EC4899", "#06B6D4", "#22C55E",
  "#F97316", "#6366F1", "#84CC16", "#64748B",
];

const empty = (venueId: string, nextOrder: number): Partial<DisplayArea> => ({
  venue_id: venueId,
  name: "",
  description: "",
  color: "#3B82F6",
  display_order: nextOrder,
  is_active: true,
  is_default: false,
});

export default function DisplayAreasCard({ venueId }: { venueId: string }) {
  const [areas, setAreas] = useState<DisplayArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<DisplayArea> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("venue_display_areas" as any)
      .select("*")
      .eq("venue_id", venueId)
      .order("display_order", { ascending: true });
    if (error) toast.error("Failed to load display areas");
    else setAreas((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [venueId]);

  const openNew = () => { setEditing(empty(venueId, areas.length)); setDialogOpen(true); };
  const openEdit = (a: DisplayArea) => { setEditing({ ...a }); setDialogOpen(true); };

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Name is required"); return; }

    const payload = {
      venue_id: venueId,
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      color: editing.color || "#3B82F6",
      display_order: editing.display_order ?? 0,
      is_active: editing.is_active ?? true,
      is_default: editing.is_default ?? false,
    };

    if (editing.is_default) {
      await supabase
        .from("venue_display_areas" as any)
        .update({ is_default: false })
        .eq("venue_id", venueId)
        .neq("id", editing.id || "00000000-0000-0000-0000-000000000000");
    }

    if (editing.id) {
      const { error } = await supabase.from("venue_display_areas" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Display area updated");
    } else {
      const { error } = await supabase.from("venue_display_areas" as any).insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Display area created");
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const remove = async (a: DisplayArea) => {
    if (!confirm(`Delete "${a.name}"? Any categories or items routed here will lose this area.`)) return;
    const { error } = await supabase.from("venue_display_areas" as any).delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Display area deleted");
    load();
  };

  const move = async (a: DisplayArea, dir: -1 | 1) => {
    const idx = areas.findIndex(x => x.id === a.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= areas.length) return;
    const other = areas[swap];
    await Promise.all([
      supabase.from("venue_display_areas" as any).update({ display_order: other.display_order }).eq("id", a.id),
      supabase.from("venue_display_areas" as any).update({ display_order: a.display_order }).eq("id", other.id),
    ]);
    load();
  };

  const toggleActive = async (a: DisplayArea) => {
    const { error } = await supabase.from("venue_display_areas" as any).update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Display Areas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Routing zones where order tickets appear (e.g. Kitchen, Bar, Expo). Assign these to menu categories — items can override their category's areas, up to 3 per item.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Display Area
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : areas.length === 0 ? (
          <div className="p-6 text-muted-foreground">No display areas yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {areas.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <div className="flex flex-col">
                  <button onClick={() => move(a, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up">
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => move(a, 1)} disabled={i === areas.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down">
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <span
                  className="inline-block h-6 w-6 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: a.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{a.name}</span>
                    {a.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    {!a.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                  </div>
                  {a.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.description}</p>
                  )}
                </div>
                <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(a)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(a)} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Display Area" : "New Display Area"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="da-name">Name *</Label>
                <Input
                  id="da-name"
                  value={editing.name || ""}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Fry Side"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="da-desc">Description</Label>
                <Textarea
                  id="da-desc"
                  value={editing.description || ""}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="What does this area handle?"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: c })}
                      className={`h-8 w-8 rounded-full border-2 transition ${editing.color === c ? "border-foreground scale-110" : "border-border"}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  <Input
                    type="color"
                    value={editing.color || "#3B82F6"}
                    onChange={e => setEditing({ ...editing, color: e.target.value })}
                    className="h-8 w-12 p-1 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={editing.is_active ?? true}
                    onCheckedChange={v => setEditing({ ...editing, is_active: v })}
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={editing.is_default ?? false}
                    onCheckedChange={v => setEditing({ ...editing, is_default: v })}
                  />
                  <span className="text-sm">Default area</span>
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
