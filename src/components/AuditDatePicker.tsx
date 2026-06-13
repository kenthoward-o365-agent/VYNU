import { useState, useMemo } from "react";
import { format, startOfDay, subDays, startOfWeek, startOfMonth, endOfDay, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type DateRange = { from: Date; to: Date; label: string };

function buildPresets(auditDateOverride?: string | null) {
  const todayDate = auditDateOverride ? parseISO(auditDateOverride) : new Date();
  const yesterdayDate = subDays(todayDate, 1);
  return [
    {
      label: "Today",
      getRange: () => ({ from: startOfDay(todayDate), to: endOfDay(todayDate) }),
    },
    {
      label: "Yesterday",
      getRange: () => ({ from: startOfDay(yesterdayDate), to: endOfDay(yesterdayDate) }),
    },
    {
      label: "Last 7 Days",
      getRange: () => ({ from: startOfDay(subDays(todayDate, 6)), to: endOfDay(todayDate) }),
    },
    {
      label: "This Week",
      getRange: () => ({ from: startOfWeek(todayDate, { weekStartsOn: 1 }), to: endOfDay(todayDate) }),
    },
    {
      label: "This Month",
      getRange: () => ({ from: startOfMonth(todayDate), to: endOfDay(todayDate) }),
    },
    {
      label: "Last 30 Days",
      getRange: () => ({ from: startOfDay(subDays(todayDate, 29)), to: endOfDay(todayDate) }),
    },
  ];
}

interface AuditDatePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Override what "Today" means — pass the venue audit date (YYYY-MM-DD) */
  auditDateOverride?: string | null;
}

export default function AuditDatePicker({ value, onChange, auditDateOverride }: AuditDatePickerProps) {
  const presets = useMemo(() => buildPresets(auditDateOverride), [auditDateOverride]);
  const [open, setOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date } | undefined>(undefined);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Reset the custom-range working state every time the popover opens so the
    // first click always sets the start date (instead of completing a range
    // that was pre-seeded from the active preset).
    if (next) setCustomRange(undefined);
  };

  const handlePreset = (preset: (typeof presets)[0]) => {
    const r = preset.getRange();
    onChange({ ...r, label: preset.label });
    setCustomRange(undefined);
    setOpen(false);
  };

  const handleCustomRange = (range: { from?: Date; to?: Date } | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      const from = startOfDay(range.from);
      const to = endOfDay(range.to);
      const sameDay = format(from, "yyyy-MM-dd") === format(to, "yyyy-MM-dd");
      onChange({
        from,
        to,
        label: sameDay
          ? format(from, "dd MMM yyyy")
          : `${format(from, "dd MMM yyyy")} – ${format(to, "dd MMM yyyy")}`,
      });
      setOpen(false);
    }
  };

  const isSingleDay =
    format(value.from, "yyyy-MM-dd") === format(value.to, "yyyy-MM-dd");

  const displayLabel = value.label === "Today" || value.label === "Yesterday" || isSingleDay
    ? `${value.label} — ${format(value.from, "dd MMM yyyy")}`
    : `${value.label} — ${format(value.from, "dd MMM")} – ${format(value.to, "dd MMM yyyy")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal gap-2",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex" align="start">
        <div className="border-r border-border p-2 space-y-1 min-w-[140px]">
          <p className="text-xs font-semibold text-muted-foreground px-2 py-1">Quick Select</p>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              className={cn(
                "w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors hover:bg-accent",
                value.label === p.label && "bg-accent text-accent-foreground font-medium"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="p-2">
          <p className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">
            Custom Range {customRange?.from && !customRange?.to && "(pick end date)"}
          </p>
          <Calendar
            mode="range"
            selected={customRange as any}
            onSelect={handleCustomRange as any}
            numberOfMonths={2}
            disabled={(date) => date > new Date()}
            className={cn("p-3 pointer-events-auto")}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function getDefaultAuditDate(auditDateOverride?: string | null): DateRange {
  const d = auditDateOverride ? parseISO(auditDateOverride) : new Date();
  return {
    from: startOfDay(d),
    to: endOfDay(d),
    label: "Today",
  };
}
