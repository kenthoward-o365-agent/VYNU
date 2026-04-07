import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { LandingSection, FeaturedItem } from "./types";
import { SECTION_LABELS } from "./types";

interface Props {
  section: LandingSection;
  onChange: (updated: LandingSection) => void;
}

const SectionEditPanel = ({ section, onChange }: Props) => {
  const update = (patch: Partial<LandingSection>) => {
    onChange({ ...section, ...patch } as LandingSection);
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{SECTION_LABELS[section.type]}</h3>

      {section.type === "hero" && (
        <>
          <Field label="Title">
            <Input value={section.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Subtitle">
            <Input value={section.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
          </Field>
          <Field label="Logo Emoji">
            <Input value={section.logoEmoji} onChange={(e) => update({ logoEmoji: e.target.value })} />
          </Field>
          <Field label="Background Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={section.bgColor}
                onChange={(e) => update({ bgColor: e.target.value })}
                className="w-10 h-10 rounded border border-border cursor-pointer"
              />
              <Input value={section.bgColor} onChange={(e) => update({ bgColor: e.target.value })} className="flex-1" />
            </div>
          </Field>
        </>
      )}

      {section.type === "table-display" && (
        <p className="text-xs text-muted-foreground">
          This section automatically shows the diner's assigned table number. No configuration needed.
        </p>
      )}

      {section.type === "featured-items" && (
        <>
          <Field label="Section Title">
            <Input value={section.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <div className="space-y-3">
            <Label className="text-xs">Items</Label>
            {section.items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  value={item.emoji}
                  onChange={(e) => {
                    const items = [...section.items];
                    items[i] = { ...items[i], emoji: e.target.value };
                    update({ items });
                  }}
                  className="w-14"
                  placeholder="🍔"
                />
                <Input
                  value={item.name}
                  onChange={(e) => {
                    const items = [...section.items];
                    items[i] = { ...items[i], name: e.target.value };
                    update({ items });
                  }}
                  placeholder="Item name"
                  className="flex-1"
                />
                <Input
                  value={item.price}
                  onChange={(e) => {
                    const items = [...section.items];
                    items[i] = { ...items[i], price: e.target.value };
                    update({ items });
                  }}
                  placeholder="$12"
                  className="w-20"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const items = section.items.filter((_, idx) => idx !== i);
                    update({ items });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const items: FeaturedItem[] = [...section.items, { emoji: "🍽️", name: "New Item", price: "$0" }];
                update({ items });
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          </div>
        </>
      )}

      {section.type === "loyalty-cta" && (
        <>
          <Field label="Heading">
            <Input value={section.heading} onChange={(e) => update({ heading: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={section.description} onChange={(e) => update({ description: e.target.value })} rows={3} />
          </Field>
        </>
      )}

      {section.type === "hours-location" && (
        <>
          <Field label="Address">
            <Input value={section.address} onChange={(e) => update({ address: e.target.value })} />
          </Field>
          <Field label="Hours">
            <Input value={section.hours} onChange={(e) => update({ hours: e.target.value })} />
          </Field>
        </>
      )}

      {section.type === "social-links" && (
        <>
          <Field label="Instagram URL">
            <Input value={section.instagram} onChange={(e) => update({ instagram: e.target.value })} placeholder="https://instagram.com/..." />
          </Field>
          <Field label="Facebook URL">
            <Input value={section.facebook} onChange={(e) => update({ facebook: e.target.value })} placeholder="https://facebook.com/..." />
          </Field>
          <Field label="Google URL">
            <Input value={section.google} onChange={(e) => update({ google: e.target.value })} placeholder="https://g.co/..." />
          </Field>
        </>
      )}

      {section.type === "text" && (
        <Field label="Content">
          <Textarea value={section.content} onChange={(e) => update({ content: e.target.value })} rows={4} />
        </Field>
      )}

      {section.type === "divider" && (
        <p className="text-xs text-muted-foreground">A simple horizontal line. No configuration needed.</p>
      )}

      {section.type === "spacer" && (
        <Field label="Height (px)">
          <Input
            type="number"
            value={section.height}
            onChange={(e) => update({ height: parseInt(e.target.value) || 16 })}
            min={8}
            max={200}
          />
        </Field>
      )}
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export default SectionEditPanel;
