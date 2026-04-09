import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check, X, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EnhanceableItem {
  id: string;
  name: string;
  image_url: string;
}

interface EnhancedResult {
  itemId: string;
  itemName: string;
  originalUrl: string;
  enhancedBase64: string;
  selected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  items: { id: string; name: string; image_url: string | null; image_ai_status?: string | null }[];
  onComplete: () => void;
}

export default function ImageEnhancerDialog({ open, onOpenChange, venueId, items, onComplete }: Props) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentItem, setCurrentItem] = useState("");
  const [results, setResults] = useState<EnhancedResult[]>([]);
  const [accepting, setAccepting] = useState(false);

  // Filter to items with images that haven't been reviewed
  const unreviewedItems: EnhanceableItem[] = items.filter(
    (i) => i.image_url && !i.image_ai_status
  ) as EnhanceableItem[];

  const runEnhancement = useCallback(async () => {
    setProcessing(true);
    setResults([]);
    setProgress(0);
    setTotal(unreviewedItems.length);

    const newResults: EnhancedResult[] = [];

    for (let i = 0; i < unreviewedItems.length; i++) {
      const item = unreviewedItems[i];
      setCurrentItem(item.name);
      setProgress(i);

      try {
        const { data, error } = await supabase.functions.invoke("enhance-menu-image", {
          body: { imageUrl: item.image_url },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.enhancedImageBase64) {
          newResults.push({
            itemId: item.id,
            itemName: item.name,
            originalUrl: item.image_url,
            enhancedBase64: data.enhancedImageBase64,
            selected: true,
          });
          setResults([...newResults]);
        }
      } catch (err: any) {
        console.error(`Failed to enhance ${item.name}:`, err);
        toast.error(`Failed to enhance "${item.name}": ${err.message || "Unknown error"}`);
      }

      // Small delay to avoid rate limiting
      if (i < unreviewedItems.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setProgress(unreviewedItems.length);
    setCurrentItem("");
    setProcessing(false);
  }, [unreviewedItems]);

  const toggleSelect = (itemId: string) => {
    setResults((prev) =>
      prev.map((r) => (r.itemId === itemId ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleAll = () => {
    const allSelected = results.every((r) => r.selected);
    setResults((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const acceptSelected = async () => {
    const selected = results.filter((r) => r.selected);
    if (selected.length === 0) {
      toast.error("No images selected");
      return;
    }

    setAccepting(true);

    for (const result of selected) {
      try {
        // Convert base64 to blob
        const base64Data = result.enhancedBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "image/png" });

        // Upload to storage
        const path = `menu-items/${venueId}/enhanced/${result.itemId}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("venue-assets")
          .upload(path, blob, { contentType: "image/png", upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("venue-assets")
          .getPublicUrl(path);

        // Update menu item
        const { error: updateError } = await supabase
          .from("menu_items")
          .update({
            image_url: urlData.publicUrl,
            image_ai_status: "enhanced" as any,
          })
          .eq("id", result.itemId);

        if (updateError) throw updateError;
      } catch (err: any) {
        console.error(`Failed to save enhanced image for ${result.itemName}:`, err);
        toast.error(`Failed to save "${result.itemName}": ${err.message}`);
      }
    }

    // Mark unselected as skipped
    const skipped = results.filter((r) => !r.selected);
    for (const result of skipped) {
      await supabase
        .from("menu_items")
        .update({ image_ai_status: "skipped" as any })
        .eq("id", result.itemId);
    }

    setAccepting(false);
    toast.success(`${selected.length} image(s) enhanced and saved`);
    onComplete();
    onOpenChange(false);
    setResults([]);
  };

  const skipItem = async (itemId: string) => {
    await supabase
      .from("menu_items")
      .update({ image_ai_status: "skipped" as any })
      .eq("id", itemId);
    setResults((prev) => prev.filter((r) => r.itemId !== itemId));
    toast.info("Image skipped");
  };

  const selectedCount = results.filter((r) => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Image Enhancer
          </DialogTitle>
        </DialogHeader>

        {/* Initial state — show count and Run button */}
        {!processing && results.length === 0 && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <ImagePlus className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {unreviewedItems.length > 0
                  ? `${unreviewedItems.length} menu item image${unreviewedItems.length !== 1 ? "s" : ""} ready for AI enhancement.`
                  : "All images have been reviewed. Add new menu item images to use this feature."}
              </p>
              <p className="text-xs text-muted-foreground">
                AI will improve lighting, vibrancy, and sharpness for mobile display.
              </p>
            </div>
            {unreviewedItems.length > 0 && (
              <Button onClick={runEnhancement} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Run Enhancement ({unreviewedItems.length} image{unreviewedItems.length !== 1 ? "s" : ""})
              </Button>
            )}
          </div>
        )}

        {/* Processing state */}
        {processing && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Enhancing: <span className="text-foreground font-medium">{currentItem}</span>
                </span>
                <span className="text-muted-foreground">
                  {progress}/{total}
                </span>
              </div>
              <Progress value={(progress / total) * 100} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
              Processing images one at a time to ensure quality...
            </p>

            {/* Show results as they come in */}
            {results.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {results.map((r) => (
                  <ResultCard key={r.itemId} result={r} onToggle={toggleSelect} onSkip={skipItem} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Results state */}
        {!processing && results.length > 0 && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={results.length > 0 && results.every((r) => r.selected)}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedCount} of {results.length} selected
                </span>
              </div>
              <Button onClick={acceptSelected} disabled={selectedCount === 0 || accepting}>
                {accepting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" />Accept Selected ({selectedCount})</>
                )}
              </Button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {results.map((r) => (
                <ResultCard key={r.itemId} result={r} onToggle={toggleSelect} onSkip={skipItem} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultCard({
  result,
  onToggle,
  onSkip,
}: {
  result: EnhancedResult;
  onToggle: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox checked={result.selected} onCheckedChange={() => onToggle(result.itemId)} />
          <span className="text-sm font-medium text-foreground truncate">{result.itemName}</span>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => onSkip(result.itemId)}>
          <X className="h-3 w-3 mr-1" />Skip
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Badge variant="outline" className="text-[10px]">Before</Badge>
          <div className="aspect-square rounded-md overflow-hidden bg-muted">
            <img src={result.originalUrl} alt="Original" className="h-full w-full object-cover" />
          </div>
        </div>
        <div className="space-y-1">
          <Badge className="text-[10px] bg-primary">After</Badge>
          <div className="aspect-square rounded-md overflow-hidden bg-muted">
            <img src={result.enhancedBase64} alt="Enhanced" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  );
}
