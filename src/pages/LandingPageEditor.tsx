import { useState, useCallback, useEffect, useRef } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Plus, Sparkles, Palette } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { SortableSection } from "@/components/landing-editor/SectionList";
import SectionEditPanel from "@/components/landing-editor/SectionEditPanel";
import ThemeEditPanel from "@/components/landing-editor/ThemeEditPanel";
import SectionAddModal from "@/components/landing-editor/SectionAddModal";
import LandingSectionRenderer from "@/components/landing-editor/LandingSectionRenderer";
import MobilePreviewFrame from "@/components/landing-editor/MobilePreviewFrame";
import AIBuildFromUrlDialog from "@/components/landing-editor/AIBuildFromUrlDialog";
import type { LandingSection, SectionType, LandingTheme } from "@/components/landing-editor/types";
import { createDefaultSection, createDefaultTheme, parseLandingPayload } from "@/components/landing-editor/types";

const DEFAULT_SECTIONS: LandingSection[] = [
  createDefaultSection("hero"),
  createDefaultSection("table-display"),
  createDefaultSection("featured-items"),
  createDefaultSection("loyalty-cta"),
  createDefaultSection("hours-location"),
];

const THEME_PSEUDO_ID = "__theme__";

export default function LandingPageEditor() {
  const { venue, refetch } = useVenue();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [theme, setTheme] = useState<LandingTheme>(createDefaultTheme());
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    if (venue?.landing_page_html) {
      const parsed = parseLandingPayload(venue.landing_page_html);
      if (parsed) {
        setSections(parsed.sections);
        setTheme(parsed.theme);
      } else {
        setSections(DEFAULT_SECTIONS.map((s) => ({ ...s, id: crypto.randomUUID() })));
      }
      initialLoadDone.current = true;
    } else if (!venue) {
      setSections(DEFAULT_SECTIONS.map((s) => ({ ...s, id: crypto.randomUUID() })));
    }
  }, [venue?.landing_page_html]);

  const [selectedId, setSelectedId] = useState<string | null>(THEME_PSEUDO_ID);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selectedSection = sections.find((s) => s.id === selectedId) ?? null;
  const themeSelected = selectedId === THEME_PSEUDO_ID;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, []);

  const handleAdd = useCallback((type: SectionType) => {
    const newSection = createDefaultSection(type);
    setSections((prev) => [...prev, newSection]);
    setSelectedId(newSection.id);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleUpdate = useCallback((updated: LandingSection) => {
    setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleSave = async () => {
    if (!venue) return;
    setSaving(true);
    const payload = JSON.stringify({ theme, sections });
    const { error } = await supabase
      .from("venues")
      .update({ landing_page_html: payload } as any)
      .eq("id", venue.id);

    if (error) {
      toast.error("Failed to save landing page");
    } else {
      toast.success("Landing page saved!");
      await refetch();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h2 className="text-sm font-semibold">Landing Page Editor</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1 text-primary" />
            Build from website
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Saving..." : "Save & Publish"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r border-border bg-card overflow-y-auto shrink-0 flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sections</p>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
            {/* Pinned theme entry */}
            <button
              onClick={() => setSelectedId(THEME_PSEUDO_ID)}
              className={`w-full flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${themeSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 bg-card"}`}
            >
              <Palette className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate flex-1 text-left">Page Theme</span>
            </button>
            <div className="h-px bg-border my-1" />
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {sections.map((section) => (
                  <SortableSection
                    key={section.id}
                    section={section}
                    isSelected={selectedId === section.id}
                    onSelect={() => setSelectedId(section.id)}
                    onDelete={() => handleDelete(section.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <MobilePreviewFrame>
            <LandingSectionRenderer sections={sections} theme={theme} />
          </MobilePreviewFrame>
        </div>

        <div className="w-64 border-l border-border bg-card overflow-y-auto shrink-0">
          {themeSelected ? (
            <ThemeEditPanel theme={theme} onChange={setTheme} />
          ) : selectedSection ? (
            <SectionEditPanel section={selectedSection} onChange={handleUpdate} venueId={venue?.id} />
          ) : (
            <div className="p-4 text-center text-muted-foreground text-sm">
              <p className="mt-8">Select a section to edit</p>
            </div>
          )}
        </div>
      </div>

      <SectionAddModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAdd} />
      <AIBuildFromUrlDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        venueId={venue?.id}
        onGenerated={(newSections, newTheme, mode) => {
          setSections((prev) => (mode === "replace" ? newSections : [...prev, ...newSections]));
          if (newTheme && mode === "replace") setTheme(newTheme);
          setSelectedId(THEME_PSEUDO_ID);
          toast.message("Remember to click Save & Publish to keep your new landing page.");
        }}
      />
    </div>
  );
}
