import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";

interface OrderStatus {
  id: string;
  venue_id: string;
  name: string;
  label: string;
  description: string | null;
  color: string;
  display_order: number;
  is_active: boolean;
  is_terminal: boolean;
  is_default: boolean;
  maps_to_system_status: string | null;
}

const SYSTEM_STATUSES = [
  { value: "received", label: "Received" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

const PRESET_COLORS = [
  "#3B82F6", "#F59E0B", "#10B981", "#8B5CF6",
  "#22C55E", "#EF4444", "#EC4899", "#06B6D4",
  "#F97316", "#6366F1", "#84CC16", "#64748B",
];

const emptyForm = (venueId: string, nextOrder: number): Partial<OrderStatus> => ({
  venue_id: venueId,
  name: "",
  label: "",
  description: "",
  color: "#3B82F6",
  display_order: nextOrder,
  is_active: true,
  is_terminal: false,
  is_default: false,
  maps_to_system_status: "received",
});

export default function OrderStatuses() {
  const { venue } = useVenue();
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<OrderStatus> | null>(null);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("venue_order_statuses")
      .select("*")
      .eq("venue_id", venue.id)
      .order("display_order", { ascending: true });
    if (error) {
      toast.error("Failed to load order statuses");
    } else {
      setStatuses(data as OrderStatus[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [venue?.id]);

  const openNew = () => {
    if (!venue) return;
    setEditing(emptyForm(venue.id, statuses.length));
    setDialogOpen(true);
  };

  const openEdit = (s: OrderStatus) => {
    setEditing({ ...s });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing || !venue) return;
    if (!editing.name?.trim() || !editing.label?.trim()) {
      toast.error("Name and label are required");
      return;
    }
    const slug = editing.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");

    const payload = {
      venue_id: venue.id,
      name: slug,
      label: editing.label.trim(),
      description: editing.description?.trim() || null,
      color: editing.color || "#3B82F6",
      display_order: editing.display_order ?? 0,
      is_active: editing.is_active ?? true,
      is_terminal: editing.is_terminal ?? false,
      is_default: editing.is_default ?? false,
      maps_to_system_status: editing.maps_to_system_status || null,
    };

    if (editing.is_default) {
      await supabase
        .from("venue_order_statuses")
        .update({ is_default: false })
        .eq("venue_id", venue.id)
        .neq("id", editing.id || "00000000-0000-0000-0000-000000000000");
    }

    if (editing.id) {
      const { error } = await supabase
        .from("venue_order_statuses")
        .update(payload)
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Status updated");
    } else {
      const { error } = await supabase
        .from("venue_order_statuses")
        .insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Status created");
    }

    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const remove = async (s: OrderStatus) => {
    if (!confirm(`Delete status "${s.label}"? Existing orders with this status will keep their value but it won't be selectable anymore.`)) return;
    const { error } = await supabase
      .from("venue_order_statuses")
      .delete()
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Status deleted");
    load();
  };

  const move = async (s: OrderStatus, dir: -1 | 1) => {
    const idx = statuses.findIndex(x => x.id === s.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= statuses.length) return;
    const other = statuses[swapIdx];
    await Promise.all([
      supabase.from("venue_order_statuses").update({ display_order: other.display_order }).eq("id", s.id),
      supabase.from("venue_order_statuses").update({ display_order: s.display_order }).eq("id", other.id),
    ]);
    load();
  };

  const toggleActive = async (s: OrderStatus) => {
    const { error } = await supabase
      .from("venue_order_statuses")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Order Display System — Statuses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define the workflow your kitchen and floor staff use to track orders. Statuses can be re-ordered, recoloured, and mapped to the underlying system status used for reporting.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Status
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : statuses.length === 0 ? (
          <div className="p-6 text-muted-foreground">No statuses yet. Click "New Status" to add one.</div>
        ) : (
          <div className="divide-y divide-border">
            {statuses.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <div className="flex flex-col">
                  <button
                    onClick={() => move(s, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => move(s, 1)}
                    disabled={i === statuses.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <span
                  className="inline-block h-6 w-6 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <code className="text-xs text-muted-foreground">{s.name}</code>
                    {s.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    {s.is_terminal && <Badge variant="outline" className="text-xs">Terminal</Badge>}
                    {!s.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                    {s.maps_to_system_status && (
                      <Badge variant="outline" className="text-xs">→ {s.maps_to_system_status}</Badge>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.description}</p>
                  )}
                </div>
                <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label="Delete">
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
            <DialogTitle>{editing?.id ? "Edit Status" : "New Status"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="label">Display Label *</Label>
                  <Input
                    id="label"
                    value={editing.label || ""}
                    onChange={e => setEditing({ ...editing, label: e.target.value })}
                    placeholder="e.g. In the Pass"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="name">Internal Name *</Label>
                  <Input
                    id="name"
                    value={editing.name || ""}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. in_the_pass"
                  />
                  <p className="text-xs text-muted-foreground">Lowercase, no spaces</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editing.description || ""}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="What does this status mean?"
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

              <div className="space-y-1">
                <Label>Maps to system status</Label>
                <Select
                  value={editing.maps_to_system_status || ""}
                  onValueChange={v => setEditing({ ...editing, maps_to_system_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SYSTEM_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for reporting & POS sync. Multiple custom statuses can map to the same system status.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
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
                  <span className="text-sm">Default</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={editing.is_terminal ?? false}
                    onCheckedChange={v => setEditing({ ...editing, is_terminal: v })}
                  />
                  <span className="text-sm">Terminal</span>
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
