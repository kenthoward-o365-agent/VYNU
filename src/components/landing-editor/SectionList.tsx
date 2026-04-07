import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingSection } from "./types";
import { SECTION_LABELS } from "./types";

interface SortableItemProps {
  section: LandingSection;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function SortableSection({ section, isSelected, onSelect, onDelete }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/40 bg-card"
      }`}
      onClick={onSelect}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium truncate flex-1">{SECTION_LABELS[section.type]}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
