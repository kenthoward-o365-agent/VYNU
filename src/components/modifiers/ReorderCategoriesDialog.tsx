import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AssignedRow {
  id: string; // assignment id
  modifier_category_id: string;
  is_required: boolean;
  display_order: number;
  category_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  menuItemId: string | null;
  menuItemName: string;
  onSaved: () => void;
}

function SortableRow({ row }: { row: AssignedRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium truncate">{row.category_name}</span>
      <Badge
        variant={row.is_required ? "default" : "secondary"}
        className="text-[10px]"
      >
        {row.is_required ? "Required" : "Optional"}
      </Badge>
    </div>
  );
}

export default function ReorderCategoriesDialog({
  open,
  onOpenChange,
  menuItemId,
  menuItemName,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<AssignedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!open || !menuItemId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("menu_item_modifiers")
        .select("id, modifier_category_id, is_required, display_order, modifier_categories(name)")
        .eq("menu_item_id", menuItemId)
        .order("display_order");
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load assignments");
        setRows([]);
      } else {
        const mapped: AssignedRow[] = ((data as any[]) || []).map((r) => ({
          id: r.id,
          modifier_category_id: r.modifier_category_id,
          is_required: !!r.is_required,
          display_order: r.display_order ?? 0,
          category_name: r.modifier_categories?.name ?? "(unknown)",
        }));
        setRows(mapped);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, menuItemId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIdx = prev.findIndex((r) => r.id === active.id);
      const newIdx = prev.findIndex((r) => r.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Persist new display_order based on array position
      await Promise.all(
        rows.map((r, idx) =>
          supabase
            .from("menu_item_modifiers")
            .update({ display_order: idx })
            .eq("id", r.id),
        ),
      );
      toast.success("Order saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reorder modifier categories</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Drag to set the order optional categories appear to diners on{" "}
          <span className="font-medium text-foreground">{menuItemName}</span>. Required
          categories always appear first regardless of order.
        </p>
        <div className="space-y-2 min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No modifier categories assigned to this item.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={rows.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {rows.map((r) => (
                    <SortableRow key={r.id} row={r} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || rows.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
