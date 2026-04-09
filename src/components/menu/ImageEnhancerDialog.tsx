import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Check, X, ImagePlus, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EnhanceableItem {
  id: string;
  name: string;
  image_url: string;
}

interface MissingImageItem {
  id: string;
  name: string;
  description: string | null;
}

interface EnhancedResult {
  itemId: string;
  itemName: string;
  originalUrl: string;
  enhancedBase64: string;
  selected: boolean;
}

interface GeneratedResult {
  itemId: string;
  itemName: string;
  generatedBase64: string;
  selected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  items: { id: string; name: string; description?: string | null; image_url: string | null; image_ai_status?: string | null }[];
  onComplete: () => void;
}

export default function ImageEnhancerDialog({ open, onOpenChange, venueId, items, onComplete }: Props) {
  const [tab, setTab] = useState("enhance");

  // --- Enhance state ---
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentItem, setCurrentItem] = useState("");
  const [results, setResults] = useState<EnhancedResult[]>([]);
  const [accepting, setAccepting] = useState(false);

  // --- Generate state ---
  const [genProcessing, setGenProcessing] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [genCurrentItem, setGenCurrentItem] = useState("");
  const [genResults, setGenResults] = useState<GeneratedResult[]>([]);
  const [genAccepting, setGenAccepting] = useState(false);

  // Filter items
  const unreviewedItems: EnhanceableItem[] = items.filter(
    (i) => i.image_url && !i.image_ai_status
  ) as EnhanceableItem[];

  const missingImageItems: MissingImageItem[] = items.filter(
    (i) => !i.image_url
  ) as MissingImageItem[];

  // ========== ENHANCE LOGIC ==========
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
    if (selected.length === 0) { toast.error("No images selected"); return; }

    setAccepting(true);
    for (const result of selected) {
      try {
        const base64Data = result.enhancedBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });

        const path = `menu-items/${venueId}/enhanced/${result.itemId}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("venue-assets")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("venue-assets").getPublicUrl(path);

        const { error: updateError } = await supabase
          .from("menu_items")
          .update({ image_url: urlData.publicUrl, image_ai_status: "enhanced" as any })
          .eq("id", result.itemId);
        if (updateError) throw updateError;
      } catch (err: any) {
        console.error(`Failed to save enhanced image for ${result.itemName}:`, err);
        toast.error(`Failed to save "${result.itemName}": ${err.message}`);
      }
    }

    const skipped = results.filter((r) => !r.selected);
    for (const result of skipped) {
      await supabase.from("menu_items").update({ image_ai_status: "skipped" as any }).eq("id", result.itemId);
    }

    setAccepting(false);
    toast.success(`${selected.length} image(s) enhanced and saved`);
    onComplete();
    onOpenChange(false);
    setResults([]);
  };

  const skipItem = async (itemId: string) => {
    await supabase.from("menu_items").update({ image_ai_status: "skipped" as any }).eq("id", itemId);
    setResults((prev) => prev.filter((r) => r.itemId !== itemId));
    toast.info("Image skipped");
  };

  // ========== GENERATE LOGIC ==========
  const runGeneration = useCallback(async () => {
    setGenProcessing(true);
    setGenResults([]);
    setGenProgress(0);
    setGenTotal(missingImageItems.length);

    const newResults: GeneratedResult[] = [];

    for (let i = 0; i < missingImageItems.length; i++) {
      const item = missingImageItems[i];
      setGenCurrentItem(item.name);
      setGenProgress(i);

      try {
        const { data, error } = await supabase.functions.invoke("generate-menu-image", {
          body: { itemName: item.name, itemDescription: item.description },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.generatedImageBase64) {
          newResults.push({
            itemId: item.id,
            itemName: item.name,
            generatedBase64: data.generatedImageBase64,
            selected: true,
          });
          setGenResults([...newResults]);
        }
      } catch (err: any) {
        console.error(`Failed to generate image for ${item.name}:`, err);
        toast.error(`Failed to generate "${item.name}": ${err.message || "Unknown error"}`);
      }

      if (i < missingImageItems.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setGenProgress(missingImageItems.length);
    setGenCurrentItem("");
    setGenProcessing(false);
  }, [missingImageItems]);

  const toggleGenSelect = (itemId: string) => {
    setGenResults((prev) =>
      prev.map((r) => (r.itemId === itemId ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleGenAll = () => {
    const allSelected = genResults.every((r) => r.selected);
    setGenResults((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const acceptGenSelected = async () => {
    const selected = genResults.filter((r) => r.selected);
    if (selected.length === 0) { toast.error("No images selected"); return; }

    setGenAccepting(true);
    for (const result of selected) {
      try {
        const base64Data = result.generatedBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });

        const path = `menu-items/${venueId}/generated/${result.itemId}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("venue-assets")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("venue-assets").getPublicUrl(path);

        const { error: updateError } = await supabase
          .from("menu_items")
          .update({ image_url: urlData.publicUrl, image_ai_status: "generated" as any })
          .eq("id", result.itemId);
        if (updateError) throw updateError;
      } catch (err: any) {
        console.error(`Failed to save generated image for ${result.itemName}:`, err);
        toast.error(`Failed to save "${result.itemName}": ${err.message}`);
      }
    }

    setGenAccepting(false);
    toast.success(`${selected.length} image(s) generated and saved`);
    onComplete();
    onOpenChange(false);
    setGenResults([]);
  };

  const skipGenItem = (itemId: string) => {
    setGenResults((prev) => prev.filter((r) => r.itemId !== itemId));
    toast.info("Image skipped");
  };

  const selectedCount = results.filter((r) => r.selected).length;
  const genSelectedCount = genResults.filter((r) => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Image Tools
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="enhance" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Enhance ({unreviewedItems.length})
            </TabsTrigger>
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <ImageOff className="h-4 w-4" />
              Generate Missing ({missingImageItems.length})
            </TabsTrigger>
          </TabsList>

          {/* ========== ENHANCE TAB ========== */}
          <TabsContent value="enhance" className="mt-4">
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

            {processing && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Enhancing: <span className="text-foreground font-medium">{currentItem}</span>
                    </span>
                    <span className="text-muted-foreground">{progress}/{total}</span>
                  </div>
                  <Progress value={(progress / total) * 100} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                  Processing images one at a time to ensure quality...
                </p>
                {results.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    {results.map((r) => (
                      <EnhanceResultCard key={r.itemId} result={r} onToggle={toggleSelect} onSkip={skipItem} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {!processing && results.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={results.length > 0 && results.every((r) => r.selected)} onCheckedChange={toggleAll} />
                    <span className="text-sm text-muted-foreground">{selectedCount} of {results.length} selected</span>
                  </div>
                  <Button onClick={acceptSelected} disabled={selectedCount === 0 || accepting}>
                    {accepting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Check className="h-4 w-4 mr-2" />Accept Selected ({selectedCount})</>}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {results.map((r) => (
                    <EnhanceResultCard key={r.itemId} result={r} onToggle={toggleSelect} onSkip={skipItem} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ========== GENERATE TAB ========== */}
          <TabsContent value="generate" className="mt-4">
            {!genProcessing && genResults.length === 0 && (
              <div className="space-y-4 py-4">
                <div className="text-center space-y-2">
                  <ImageOff className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {missingImageItems.length > 0
                      ? `${missingImageItems.length} menu item${missingImageItems.length !== 1 ? "s" : ""} without an image.`
                      : "All menu items already have images. Nice work!"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    AI will generate a professional food photo based on the item name and description.
                  </p>
                </div>
                {missingImageItems.length > 0 && (
                  <Button onClick={runGeneration} className="w-full">
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Generate Images ({missingImageItems.length} item{missingImageItems.length !== 1 ? "s" : ""})
                  </Button>
                )}
              </div>
            )}

            {genProcessing && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Generating: <span className="text-foreground font-medium">{genCurrentItem}</span>
                    </span>
                    <span className="text-muted-foreground">{genProgress}/{genTotal}</span>
                  </div>
                  <Progress value={(genProgress / genTotal) * 100} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                  Generating images one at a time...
                </p>
                {genResults.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    {genResults.map((r) => (
                      <GenerateResultCard key={r.itemId} result={r} onToggle={toggleGenSelect} onSkip={skipGenItem} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {!genProcessing && genResults.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={genResults.length > 0 && genResults.every((r) => r.selected)} onCheckedChange={toggleGenAll} />
                    <span className="text-sm text-muted-foreground">{genSelectedCount} of {genResults.length} selected</span>
                  </div>
                  <Button onClick={acceptGenSelected} disabled={genSelectedCount === 0 || genAccepting}>
                    {genAccepting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Check className="h-4 w-4 mr-2" />Accept Selected ({genSelectedCount})</>}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {genResults.map((r) => (
                    <GenerateResultCard key={r.itemId} result={r} onToggle={toggleGenSelect} onSkip={skipGenItem} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EnhanceResultCard({
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

function GenerateResultCard({
  result,
  onToggle,
  onSkip,
}: {
  result: GeneratedResult;
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
      <div className="space-y-1">
        <Badge className="text-[10px] bg-primary">AI Generated</Badge>
        <div className="aspect-square rounded-md overflow-hidden bg-muted">
          <img src={result.generatedBase64} alt="Generated" className="h-full w-full object-cover" />
        </div>
      </div>
    </div>
  );
}
