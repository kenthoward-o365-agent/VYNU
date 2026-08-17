// Searchable IANA timezone picker. VYNU sells globally: the venue's timezone
// drives concierge booking times, "today" in Vee's prompt, and any
// venue-local rendering — so it must be settable per venue, not assumed.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function allTimezones(): string[] {
  try {
    // Not in this project's TS lib yet, but present in every target browser.
    return (Intl as unknown as { supportedValuesOf(k: string): string[] })
      .supportedValuesOf("timeZone");
  } catch {
    // Ancient runtime — offer a sane minimal set rather than nothing.
    return [
      "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
      "Australia/Adelaide", "Australia/Perth", "Pacific/Auckland",
      "America/New_York", "America/Chicago", "America/Denver",
      "America/Los_Angeles", "Europe/London", "Asia/Singapore", "UTC",
    ];
  }
}

/** "America/New_York" → "America/New York · GMT-4" (offset now). */
function zoneLabel(tz: string): string {
  let offset = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    // leave offset blank for zones the runtime can't format
  }
  return offset ? `${tz.replace(/_/g, " ")} · ${offset}` : tz.replace(/_/g, " ");
}

interface Props {
  value: string | null | undefined;
  onChange: (tz: string) => void;
  disabled?: boolean;
}

export function TimezoneSelect({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(allTimezones, []);

  const localNow = useMemo(() => {
    if (!value) return null;
    try {
      return new Date().toLocaleTimeString("en-US", {
        timeZone: value, hour: "numeric", minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [value, open]);

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              {value ? zoneLabel(value) : "Select timezone…"}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search timezones…" />
            <CommandList>
              <CommandEmpty>No timezone found.</CommandEmpty>
              <CommandGroup>
                {zones.map((tz) => (
                  <CommandItem
                    key={tz}
                    value={tz}
                    onSelect={() => {
                      onChange(tz);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === tz ? "opacity-100" : "opacity-0")}
                    />
                    {zoneLabel(tz)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {localNow && (
        <p className="text-xs text-muted-foreground">Local time there now: {localNow}</p>
      )}
    </div>
  );
}
