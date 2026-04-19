import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DisplayAreaOption {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

interface Props {
  available: DisplayAreaOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  disabled?: boolean;
}

/**
 * Multi-select chip picker for Display Areas. Capped at `max` (default 3).
 */
export default function DisplayAreaPicker({
  available, selectedIds, onChange, max = 3, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const activeAvailable = available.filter(a => a.is_active);
  const selected = selectedIds
    .map(id => available.find(a => a.id === id))
    .filter(Boolean) as DisplayAreaOption[];
  const remaining = activeAvailable.filter(a => !selectedIds.includes(a.id));
  const atMax = selected.length >= max;

  const add = (id: string) => {
    if (atMax) {
      toast.error(`Maximum ${max} display areas allowed`);
      return;
    }
    onChange([...selectedIds, id]);
    setOpen(false);
  };

  const remove = (id: string) => onChange(selectedIds.filter(x => x !== id));

  if (activeAvailable.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No active display areas. Create them under Orders → Order Display System.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map(a => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs font-medium border"
          style={{ backgroundColor: `${a.color}22`, borderColor: `${a.color}66`, color: "inherit" }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: a.color }}
          />
          {a.name}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(a.id)}
              className="ml-0.5 rounded-full hover:bg-background/60 p-0.5"
              aria-label={`Remove ${a.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={atMax || remaining.length === 0}
              title={atMax ? `Maximum ${max} reached` : "Add display area"}
            >
              <Plus className="h-3 w-3 mr-1" />
              {selected.length === 0 ? "Add area" : "Add"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            {remaining.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">All areas selected</p>
            ) : (
              <div className="flex flex-col">
                {remaining.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => add(a.id)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                    )}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: a.color }}
                    />
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      <span className="text-[10px] text-muted-foreground ml-1">
        {selected.length}/{max}
      </span>
    </div>
  );
}
