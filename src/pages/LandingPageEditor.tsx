import { useEffect, useRef, useState } from "react";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const defaultContent = `
<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;">
  <div style="margin-bottom:2rem;">
    <div style="width:96px;height:96px;border-radius:1rem;background:rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:2.5rem;">🍽️</div>
  </div>
  <h1 style="font-size:2.5rem;font-weight:800;margin:0 0 0.5rem;">Welcome to Our Venue</h1>
  <p style="color:rgba(255,255,255,0.7);font-size:0.9rem;margin:0 0 2rem;">Scan, order, enjoy — no app needed</p>
  <div style="background:rgba(255,255,255,0.1);border-radius:1rem;padding:1.5rem 2rem;margin-bottom:1.5rem;border:1px solid rgba(255,255,255,0.15);">
    <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.5);margin:0 0 0.25rem;">Your Table</p>
    <p style="font-size:3rem;font-weight:700;color:#7c3aed;margin:0;">{{TABLE}}</p>
  </div>
  <div style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:1rem;padding:1rem 1.5rem;margin-bottom:1.5rem;max-width:320px;width:100%;">
    <p style="font-weight:600;font-size:0.95rem;margin:0 0 0.25rem;">🎁 Earn Rewards</p>
    <p style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin:0;">Sign up for loyalty and earn points with every order.</p>
  </div>
  <p style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:1rem;">Powered by <strong style="color:#7c3aed;">Tab-Less</strong></p>
</div>
`;

export default function LandingPageEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<Editor | null>(null);
  const { venue } = useVenue();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editorRef.current || editorInstance.current) return;

    const editor = grapesjs.init({
      container: editorRef.current,
      height: "100%",
      width: "auto",
      storageManager: false,
      panels: { defaults: [] },
      deviceManager: {
        devices: [
          { name: "Mobile", width: "375px" },
          { name: "Tablet", width: "768px" },
          { name: "Desktop", width: "" },
        ],
      },
      canvas: {
        styles: [
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
        ],
      },
      blockManager: {
        appendTo: "#blocks-panel",
      },
      styleManager: {
        appendTo: "#styles-panel",
        sectors: [
          {
            name: "Layout",
            open: true,
            properties: [
              "display", "flex-direction", "justify-content", "align-items",
              "gap", "padding", "margin", "width", "height", "min-height",
            ],
          },
          {
            name: "Typography",
            open: false,
            properties: [
              "font-family", "font-size", "font-weight", "color",
              "text-align", "line-height", "letter-spacing",
            ],
          },
          {
            name: "Background",
            open: false,
            properties: ["background", "background-color", "background-image"],
          },
          {
            name: "Borders",
            open: false,
            properties: ["border", "border-radius", "box-shadow"],
          },
        ],
      },
      layerManager: {
        appendTo: "#layers-panel",
      },
    });

    // Custom hospitality blocks
    editor.BlockManager.add("hero-section", {
      label: "🏠 Hero Section",
      category: "Hospitality",
      content: `<div style="padding:4rem 2rem;text-align:center;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#fff;min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <h1 style="font-size:2.5rem;font-weight:800;margin:0 0 0.5rem;">Your Venue Name</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:1.1rem;margin:0;">Your tagline goes here</p>
      </div>`,
    });

    editor.BlockManager.add("loyalty-cta", {
      label: "🎁 Loyalty CTA",
      category: "Hospitality",
      content: `<div style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:1rem;padding:1.5rem;margin:1rem auto;max-width:320px;text-align:center;color:#fff;">
        <p style="font-weight:600;font-size:1rem;margin:0 0 0.5rem;">🎁 Earn Rewards</p>
        <p style="font-size:0.85rem;color:rgba(255,255,255,0.7);margin:0;">Sign up and earn points with every order.</p>
      </div>`,
    });

    editor.BlockManager.add("table-display", {
      label: "🪑 Table Number",
      category: "Hospitality",
      content: `<div style="background:rgba(255,255,255,0.1);border-radius:1rem;padding:1.5rem 2rem;margin:1rem auto;max-width:200px;text-align:center;border:1px solid rgba(255,255,255,0.15);color:#fff;">
        <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.5);margin:0 0 0.25rem;">Your Table</p>
        <p style="font-size:3rem;font-weight:700;color:#7c3aed;margin:0;">{{TABLE}}</p>
      </div>`,
    });

    editor.BlockManager.add("featured-items", {
      label: "⭐ Featured Items",
      category: "Hospitality",
      content: `<div style="padding:2rem;text-align:center;color:#fff;">
        <h2 style="font-size:1.5rem;font-weight:700;margin:0 0 1rem;">Today's Specials</h2>
        <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
          <div style="background:rgba(255,255,255,0.08);border-radius:0.75rem;padding:1rem;width:140px;border:1px solid rgba(255,255,255,0.1);">
            <p style="font-size:1.5rem;margin:0 0 0.5rem;">🥩</p>
            <p style="font-weight:600;font-size:0.85rem;margin:0 0 0.25rem;">Wagyu Steak</p>
            <p style="color:#7c3aed;font-weight:700;font-size:0.9rem;margin:0;">$45</p>
          </div>
          <div style="background:rgba(255,255,255,0.08);border-radius:0.75rem;padding:1rem;width:140px;border:1px solid rgba(255,255,255,0.1);">
            <p style="font-size:1.5rem;margin:0 0 0.5rem;">🍷</p>
            <p style="font-weight:600;font-size:0.85rem;margin:0 0 0.25rem;">House Wine</p>
            <p style="color:#7c3aed;font-weight:700;font-size:0.9rem;margin:0;">$12</p>
          </div>
        </div>
      </div>`,
    });

    editor.BlockManager.add("hours-location", {
      label: "📍 Hours & Location",
      category: "Hospitality",
      content: `<div style="padding:2rem;text-align:center;color:#fff;max-width:320px;margin:0 auto;">
        <h3 style="font-size:1.1rem;font-weight:600;margin:0 0 1rem;">📍 Find Us</h3>
        <p style="font-size:0.85rem;color:rgba(255,255,255,0.7);margin:0 0 0.5rem;">123 Main Street, Sydney NSW 2000</p>
        <p style="font-size:0.85rem;color:rgba(255,255,255,0.7);margin:0;">Mon-Fri 11am-10pm · Sat-Sun 9am-11pm</p>
      </div>`,
    });

    editor.BlockManager.add("social-links", {
      label: "📱 Social Links",
      category: "Hospitality",
      content: `<div style="padding:1.5rem;text-align:center;display:flex;gap:1.5rem;justify-content:center;">
        <a href="#" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85rem;">Instagram</a>
        <a href="#" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85rem;">Facebook</a>
        <a href="#" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85rem;">Google</a>
      </div>`,
    });

    editor.BlockManager.add("text-block", {
      label: "📝 Text",
      category: "Basic",
      content: `<p style="color:#fff;font-size:1rem;padding:0.5rem 1rem;">Your text here</p>`,
    });

    editor.BlockManager.add("heading-block", {
      label: "🔤 Heading",
      category: "Basic",
      content: `<h2 style="color:#fff;font-size:1.8rem;font-weight:700;padding:0.5rem 1rem;margin:0;">Heading</h2>`,
    });

    editor.BlockManager.add("image-block", {
      label: "🖼️ Image",
      category: "Basic",
      content: { type: "image" },
    });

    editor.BlockManager.add("divider-block", {
      label: "➖ Divider",
      category: "Basic",
      content: `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:1.5rem auto;max-width:200px;" />`,
    });

    editor.BlockManager.add("spacer-block", {
      label: "↕️ Spacer",
      category: "Basic",
      content: `<div style="height:2rem;"></div>`,
    });

    // Load existing content or default
    const existingHtml = (venue as any)?.landing_page_html;
    if (existingHtml) {
      editor.setComponents(existingHtml);
    } else {
      editor.setComponents(defaultContent);
    }

    editorInstance.current = editor;

    return () => {
      editor.destroy();
      editorInstance.current = null;
    };
  }, [venue]);

  const handleSave = async () => {
    if (!editorInstance.current || !venue) return;
    setSaving(true);

    const html = editorInstance.current.getHtml();
    const css = editorInstance.current.getCss();
    const fullHtml = `<style>${css}</style>${html}`;

    const { error } = await supabase
      .from("venues")
      .update({ landing_page_html: fullHtml } as any)
      .eq("id", venue.id);

    if (error) {
      toast.error("Failed to save landing page");
    } else {
      toast.success("Landing page saved!");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h2 className="text-sm font-semibold text-foreground">Landing Page Editor</h2>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving..." : "Save & Publish"}
        </Button>
      </div>

      {/* Editor Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Blocks */}
        <div className="w-56 border-r border-border bg-card overflow-y-auto shrink-0">
          <div className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Blocks</p>
          </div>
          <div id="blocks-panel" />
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          <div ref={editorRef} className="h-full" />
        </div>

        {/* Right Panel - Styles & Layers */}
        <div className="w-64 border-l border-border bg-card overflow-y-auto shrink-0">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Style</p>
          </div>
          <div id="styles-panel" />
          <div className="p-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Layers</p>
          </div>
          <div id="layers-panel" />
        </div>
      </div>
    </div>
  );
}
