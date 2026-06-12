import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resizeFileToWebP } from "@/lib/image-utils";
import { toast } from "sonner";
import type { LandingSection, FeaturedItem } from "./types";
import { SECTION_LABELS } from "./types";

interface Props {
  section: LandingSection;
  onChange: (updated: LandingSection) => void;
  venueId?: string;
}

function ColorRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const isHex = /^#([0-9a-f]{3}){1,2}$/i.test(value || "");
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
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Inherit from theme"} className="flex-1" />
      </div>
    </div>
  );
}

function ImageUploadField({ label, value, onChange, venueId }: { label: string; value: string; onChange: (url: string) => void; venueId?: string }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = useCallback(async (file: File) => {
    if (!venueId) return toast.error("No venue selected");
    setUploading(true);
    try {
      const blob = await resizeFileToWebP(file, 1600, 0.85);
      const path = `landing/${venueId}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from("venue-assets").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("venue-assets").getPublicUrl(path);
      onChange(urlData.publicUrl);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [venueId, onChange]);

  return (
    <Field label={label}>
      {value ? (
        <div className="relative rounded-md overflow-hidden border border-border">
          <img src={value} alt="Preview" className="w-full h-28 object-cover" />
          <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => onChange("")}><X className="h-3 w-3" /></Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
          {uploading ? "Uploading..." : "Upload Image"}
        </Button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste image URL" className="mt-1.5 text-xs" />
    </Field>
  );
}

const SectionEditPanel = ({ section, onChange, venueId }: Props) => {
  const update = (patch: Partial<LandingSection>) => onChange({ ...section, ...patch } as LandingSection);

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{SECTION_LABELS[section.type]}</h3>

      {section.type === "hero" && (
        <>
          <ImageUploadField label="Hero Image" value={section.heroImageUrl || ""} onChange={(url) => update({ heroImageUrl: url })} venueId={venueId} />
          <p className="text-[0.65rem] text-muted-foreground -mt-2">A wide banner (16:9 or 21:9) works best. Logos get auto-cropped — use a real food/venue photo.</p>
          <Field label="Title"><Input value={section.title} onChange={(e) => update({ title: e.target.value })} /></Field>
          <Field label="Subtitle"><Input value={section.subtitle} onChange={(e) => update({ subtitle: e.target.value })} /></Field>
          {section.heroImageUrl && (
            <Field label={`Image overlay darkness (${Math.round((section.overlayOpacity ?? 0.5) * 100)}%)`}>
              <input type="range" min={0} max={0.9} step={0.05} value={section.overlayOpacity ?? 0.5} onChange={(e) => update({ overlayOpacity: parseFloat(e.target.value) })} className="w-full" />
            </Field>
          )}
          {!section.heroImageUrl && (
            <>
              <Field label="Logo Emoji"><Input value={section.logoEmoji} onChange={(e) => update({ logoEmoji: e.target.value })} /></Field>
              <ColorRow label="Background Color" value={section.bgColor} onChange={(v) => update({ bgColor: v })} />
            </>
          )}
        </>
      )}

      {section.type === "table-display" && (
        <>
          <Field label="Label Text"><Input value={section.label ?? "Your Table"} onChange={(e) => update({ label: e.target.value })} /></Field>
          <ColorRow label="Number Color" value={section.numberColor ?? ""} onChange={(v) => update({ numberColor: v })} />
          <ColorRow label="Background Color" value={section.bgColor ?? ""} onChange={(v) => update({ bgColor: v })} />
          <ColorRow label="Border Color" value={section.borderColor ?? ""} onChange={(v) => update({ borderColor: v })} />
          <ColorRow label="Label Color" value={section.labelColor ?? ""} onChange={(v) => update({ labelColor: v })} />
        </>
      )}

      {section.type === "featured-items" && (
        <>
          <Field label="Section Title"><Input value={section.title} onChange={(e) => update({ title: e.target.value })} /></Field>
          <div className="space-y-3">
            <Label className="text-xs">Items</Label>
            {section.items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input value={item.emoji} onChange={(e) => { const items = [...section.items]; items[i] = { ...items[i], emoji: e.target.value }; update({ items }); }} className="w-14" placeholder="🍔" />
                <Input value={item.name} onChange={(e) => { const items = [...section.items]; items[i] = { ...items[i], name: e.target.value }; update({ items }); }} placeholder="Item name" className="flex-1" />
                <Input value={item.price} onChange={(e) => { const items = [...section.items]; items[i] = { ...items[i], price: e.target.value }; update({ items }); }} placeholder="$12" className="w-20" />
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => update({ items: section.items.filter((_, idx) => idx !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => { const items: FeaturedItem[] = [...section.items, { emoji: "🍽️", name: "New Item", price: "$0" }]; update({ items }); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          </div>
          <ColorRow label="Section Background" value={section.bgColor ?? ""} onChange={(v) => update({ bgColor: v })} />
          <ColorRow label="Card Background" value={section.cardBgColor ?? ""} onChange={(v) => update({ cardBgColor: v })} />
          <ColorRow label="Card Border" value={section.cardBorderColor ?? ""} onChange={(v) => update({ cardBorderColor: v })} />
          <ColorRow label="Title Color" value={section.titleColor ?? ""} onChange={(v) => update({ titleColor: v })} />
          <ColorRow label="Price Color" value={section.priceColor ?? ""} onChange={(v) => update({ priceColor: v })} />
        </>
      )}

      {section.type === "loyalty-cta" && (
        <>
          <Field label="Display Mode">
            <div className="flex gap-1">
              <Button variant={(!section.variant || section.variant === "text") ? "default" : "outline"} size="sm" className="flex-1" onClick={() => update({ variant: "text" })}>Text</Button>
              <Button variant={section.variant === "image" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => update({ variant: "image" })}>Image</Button>
            </div>
          </Field>
          {section.variant === "image" && (
            <ImageUploadField label="CTA Image" value={section.imageUrl || ""} onChange={(url) => update({ imageUrl: url })} venueId={venueId} />
          )}
          <Field label="Icon"><Input value={section.icon ?? "🎁"} onChange={(e) => update({ icon: e.target.value })} placeholder="🎁 (empty to hide)" /></Field>
          <Field label="Heading"><Input value={section.heading} onChange={(e) => update({ heading: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={section.description} onChange={(e) => update({ description: e.target.value })} rows={3} /></Field>
          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground font-semibold">Call-to-action button</p>
            <Field label="Button Label"><Input value={section.ctaLabel ?? ""} onChange={(e) => update({ ctaLabel: e.target.value })} placeholder="Join Hooters Nation" /></Field>
            <Field label="Button URL"><Input value={section.ctaUrl ?? ""} onChange={(e) => update({ ctaUrl: e.target.value })} placeholder="https://..." /></Field>
            <p className="text-[0.65rem] text-muted-foreground -mt-2">Button only appears when both label and URL are filled.</p>
            <ColorRow label="Button Background" value={section.buttonBgColor ?? ""} onChange={(v) => update({ buttonBgColor: v })} />
            <ColorRow label="Button Text" value={section.buttonTextColor ?? ""} onChange={(v) => update({ buttonTextColor: v })} />
          </div>
          <ColorRow label="Background" value={section.bgColor ?? ""} onChange={(v) => update({ bgColor: v })} />
          <ColorRow label="Border" value={section.borderColor ?? ""} onChange={(v) => update({ borderColor: v })} />
          <ColorRow label="Heading Color" value={section.headingColor ?? ""} onChange={(v) => update({ headingColor: v })} />
          <ColorRow label="Description Color" value={section.descriptionColor ?? ""} onChange={(v) => update({ descriptionColor: v })} />
        </>
      )}

      {section.type === "hours-location" && (
        <>
          <Field label="Address"><Input value={section.address} onChange={(e) => update({ address: e.target.value })} /></Field>
          <Field label="Hours"><Input value={section.hours} onChange={(e) => update({ hours: e.target.value })} /></Field>
          <Field label="Map URL (optional)"><Input value={section.mapUrl ?? ""} onChange={(e) => update({ mapUrl: e.target.value })} placeholder="https://maps.google.com/..." /></Field>
          <ColorRow label="Background" value={section.bgColor ?? ""} onChange={(v) => update({ bgColor: v })} />
          <ColorRow label="Heading Color" value={section.headingColor ?? ""} onChange={(v) => update({ headingColor: v })} />
          <ColorRow label="Text Color" value={section.textColor ?? ""} onChange={(v) => update({ textColor: v })} />
        </>
      )}

      {section.type === "social-links" && (
        <>
          <Field label="Instagram URL"><Input value={section.instagram} onChange={(e) => update({ instagram: e.target.value })} placeholder="https://instagram.com/..." /></Field>
          <Field label="Facebook URL"><Input value={section.facebook} onChange={(e) => update({ facebook: e.target.value })} placeholder="https://facebook.com/..." /></Field>
          <Field label="Google URL"><Input value={section.google} onChange={(e) => update({ google: e.target.value })} placeholder="https://g.co/..." /></Field>
          <ColorRow label="Icon Color" value={section.iconColor ?? ""} onChange={(v) => update({ iconColor: v })} />
        </>
      )}

      {section.type === "text" && (
        <>
          <Field label="Content"><Textarea value={section.content} onChange={(e) => update({ content: e.target.value })} rows={4} /></Field>
          <Field label="Alignment">
            <Select value={section.align ?? "center"} onValueChange={(v) => update({ align: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Weight">
            <Select value={section.weight ?? "normal"} onValueChange={(v) => update({ weight: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ColorRow label="Text Color" value={section.color ?? ""} onChange={(v) => update({ color: v })} />
        </>
      )}

      {section.type === "divider" && (
        <>
          <ColorRow label="Line Color" value={section.color ?? ""} onChange={(v) => update({ color: v })} />
          <Field label="Thickness (px)">
            <Input type="number" value={section.thickness ?? 1} onChange={(e) => update({ thickness: parseInt(e.target.value) || 1 })} min={1} max={8} />
          </Field>
        </>
      )}

      {section.type === "spacer" && (
        <Field label="Height (px)">
          <Input type="number" value={section.height} onChange={(e) => update({ height: parseInt(e.target.value) || 16 })} min={8} max={200} />
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
