import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LandingTheme } from "./types";

interface Props {
  theme: LandingTheme;
  onChange: (next: LandingTheme) => void;
}

const POPULAR_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Oswald",
  "Playfair Display", "Merriweather", "Raleway", "Nunito", "Source Sans 3",
  "DM Sans", "Space Grotesk", "Bebas Neue", "Lora", "Work Sans", "Manrope",
];

function ColorRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const isHex = /^#([0-9a-f]{3}){1,2}$/i.test(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={isHex ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded border border-border cursor-pointer shrink-0"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1" />
      </div>
    </div>
  );
}

export default function ThemeEditPanel({ theme, onChange }: Props) {
  const update = (patch: Partial<LandingTheme>) => onChange({ ...theme, ...patch });

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">🎨 Page Theme</h3>
        <p className="text-[0.7rem] text-muted-foreground mt-1">Colours and fonts that apply across every section. Individual sections can override.</p>
      </div>

      <ColorRow label="Page Background" value={theme.background} onChange={(v) => update({ background: v })} placeholder="#hex or CSS gradient" />
      <p className="text-[0.65rem] text-muted-foreground -mt-2">Accepts a hex colour or full CSS like <code>linear-gradient(...)</code>.</p>

      <ColorRow label="Accent (CTAs, table #)" value={theme.accent} onChange={(v) => update({ accent: v })} />
      <ColorRow label="Surface (cards/panels)" value={theme.surface} onChange={(v) => update({ surface: v })} />
      <ColorRow label="Border" value={theme.border} onChange={(v) => update({ border: v })} />
      <ColorRow label="Primary Text" value={theme.textPrimary} onChange={(v) => update({ textPrimary: v })} />
      <ColorRow label="Muted Text" value={theme.textMuted} onChange={(v) => update({ textMuted: v })} />

      <div className="space-y-1.5">
        <Label className="text-xs">Heading Font</Label>
        <Select value={theme.fontHeading} onValueChange={(v) => update({ fontHeading: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {POPULAR_FONTS.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Body Font</Label>
        <Select value={theme.fontBody} onValueChange={(v) => update({ fontBody: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {POPULAR_FONTS.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
