import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LandingSection } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  venueId: string | undefined;
  onGenerated: (sections: LandingSection[], mode: "replace" | "append") => void;
}

export default function AIBuildFromUrlDialog({ open, onClose, venueId, onGenerated }: Props) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");

  const handleGenerate = async () => {
    if (!venueId) return toast.error("No venue selected");
    if (!url.trim()) return toast.error("Enter a website URL");

    setLoading(true);
    setStage("Scraping site…");
    try {
      // animate stages
      const t1 = setTimeout(() => setStage("Analysing branding…"), 4000);
      const t2 = setTimeout(() => setStage("Composing sections…"), 9000);

      const { data, error } = await supabase.functions.invoke("landing-from-url", {
        body: { venue_id: venueId, url: url.trim() },
      });
      clearTimeout(t1);
      clearTimeout(t2);

      if (error) throw error;
      if (!data?.sections?.length) throw new Error("No sections were generated");

      // Add client-side ids
      const withIds: LandingSection[] = data.sections.map((s: any) => ({
        ...s,
        id: crypto.randomUUID(),
      }));

      onGenerated(withIds, mode);
      toast.success(`Generated ${withIds.length} sections from your website`);
      setUrl("");
      onClose();
    } catch (e: any) {
      const msg = e?.message || String(e);
      toast.error(msg.includes("402") ? "AI credits exhausted — top up to continue" : `Failed: ${msg}`);
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Build from website
          </DialogTitle>
          <DialogDescription>
            Paste your existing restaurant website. We'll grab the colours, fonts, and content and assemble a landing page for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="url">Website URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://yourrestaurant.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>How to apply</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} disabled={loading}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="replace" id="m-replace" />
                <Label htmlFor="m-replace" className="font-normal cursor-pointer">Replace current sections</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="append" id="m-append" />
                <Label htmlFor="m-append" className="font-normal cursor-pointer">Append to current sections</Label>
              </div>
            </RadioGroup>
          </div>

          {loading && stage && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !url.trim()}>
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
