import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Check, X, ImagePlus, ImageOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { functionErrorMessage } from "@/lib/function-errors";
import { toast } from "sonner";
import { resizeToWebP } from "@/lib/image-utils";

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
  /** When set, all queries/generation are scoped to these menu item ids (current menu). */
  scopedItemIds?: string[];
  onComplete: () => void;
}

export default function ImageEnhancerDialog({ open, onOpenChange, venueId, items, scopedItemIds, onComplete }: Props) {
  const ENHANCE_REQUEST_TIMEOUT_MS = 90_000;
  const ENHANCE_DELAY_MS = 1_500;
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
  const [genResults, setGenResults] = useState<GeneratedResult[]>([]);
  const [genAccepting, setGenAccepting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter items
  const unreviewedItems: EnhanceableItem[] = items.filter(
    (i) => i.image_url && !i.image_ai_status
  ) as EnhanceableItem[];

  const missingImageItems: MissingImageItem[] = items.filter(
    (i) => !i.image_url
  ) as MissingImageItem[];

  // ========== ENHANCE LOGIC ==========
  const runEnhancement = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    setProcessing(true);
    setResults([]);
    setProgress(0);
    setTotal(unreviewedItems.length);

    const newResults: EnhancedResult[] = [];

    for (let i = 0; i < unreviewedItems.length; i++) {
      const item = unreviewedItems[i];
      setCurrentItem(item.name);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), ENHANCE_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enhance-menu-image`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ imageUrl: item.image_url }),
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "AI enhancement failed");
        }

        if (data?.error) throw new Error(data.error);
        if (!data?.enhancedImageBase64) throw new Error("No enhanced image returned");

        newResults.push({
          itemId: item.id,
          itemName: item.name,
          originalUrl: item.image_url,
          enhancedBase64: data.enhancedImageBase64,
          selected: true,
        });
        setResults([...newResults]);
      } catch (err: any) {
        console.error(`Failed to enhance ${item.name}:`, err);
        const timedOut = err instanceof DOMException && err.name === "AbortError";
        toast.error(
          timedOut
            ? `Enhancement timed out for "${item.name}" — skipped and continuing.`
            : `Failed to enhance "${item.name}": ${err.message || "Unknown error"}`
        );
      } finally {
        window.clearTimeout(timeoutId);
        setProgress(i + 1);
      }

      if (i < unreviewedItems.length - 1) {
        await new Promise((r) => window.setTimeout(r, ENHANCE_DELAY_MS));
      }
    }

    setProgress(unreviewedItems.length);
    setCurrentItem("");
    setProcessing(false);
  }, [ENHANCE_DELAY_MS, ENHANCE_REQUEST_TIMEOUT_MS, unreviewedItems]);

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
        const blob = await resizeToWebP(result.enhancedBase64, 800, 0.8);

        const path = `menu-items/${venueId}/enhanced/${result.itemId}-${Date.now()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from("venue-assets")
          .upload(path, blob, { contentType: "image/webp", upsert: true });
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

  // ========== GENERATE LOGIC (Background with self-healing batches) ==========
  const STALE_TIMEOUT_MS = 45_000;

  const itemsInProgress = items.filter(
    (i) => i.image_ai_status === "queued" || i.image_ai_status === "processing"
  );

  const dispatchGeneration = useCallback(async (chunk?: MissingImageItem[]) => {
    // Always scope to the current menu's items when a scope is provided.
    const target = chunk?.length ? chunk : (scopedItemIds ? missingImageItems : undefined);
    const payload = target?.length
      ? { venueId, items: target.map((i) => ({ id: i.id, name: i.name, description: i.description })) }
      : { venueId };

    const { data, error } = await supabase.functions.invoke("batch-generate-images", {
      body: payload,
    });
    const failure = await functionErrorMessage({ data, error }, "Image generation failed");
    if (failure) throw new Error(failure);
    return data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, scopedItemIds, missingImageItems]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, []);

  // Start polling when generation is in progress
  useEffect(() => {
    if (genProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const scope = <T extends { in: (c: string, v: any[]) => T }>(q: T) =>
          scopedItemIds ? q.in("id", scopedItemIds) : q;

        const { data: pending } = await scope(
          supabase
            .from("menu_items")
            .select("id, name, image_url, image_ai_status")
            .eq("venue_id", venueId)
            .in("image_ai_status", ["queued", "processing"] as any[]) as any
        );

        const { data: completed } = await scope(
          supabase
            .from("menu_items")
            .select("id, name, image_url, image_ai_status")
            .eq("venue_id", venueId)
            .in("image_ai_status", ["generated", "failed"] as any[]) as any
        );

        const { count: remainingMissing } = await scope(
          supabase
            .from("menu_items")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", venueId)
            .is("image_url", null) as any
        );

        const generated = (completed || []).filter(
          (c) => c.image_ai_status === "generated" && c.image_url
        );
        const failed = (completed || []).filter((c) => c.image_ai_status === "failed");

        // remainingMissing counts every item with no image_url — which already
        // includes the pending and failed ones. Adding them all produced a
        // denominator ~2x the real target (e.g. "85/181" for a 90-image run),
        // and re-queued failures made the numerator go backwards. Count only
        // items no attempt has touched yet as "still to come".
        const untouched = Math.max(
          0,
          (remainingMissing || 0) - (pending?.length || 0) - failed.length,
        );
        setGenProgress(generated.length + failed.length);
        setGenTotal(generated.length + failed.length + (pending?.length || 0) + untouched);

        const newResults: GeneratedResult[] = generated.map((g) => ({
          itemId: g.id,
          itemName: g.name,
          generatedBase64: g.image_url!,
          selected: true,
        }));
        setGenResults(newResults);

        if (pending && pending.length > 0) {
          if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
          staleTimerRef.current = setTimeout(async () => {
            try {
              await dispatchGeneration();
            } catch (err) {
              console.error("Failed to recover stale image batch:", err);
            }
          }, STALE_TIMEOUT_MS);
          return;
        }

        if ((remainingMissing || 0) > 0) {
          try {
            await dispatchGeneration();
            return;
          } catch (err: any) {
            console.error("Failed to dispatch next server batch:", err);
            toast.error(`Batch error: ${err.message}`);
          }
        }

        setGenProcessing(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        if (staleTimerRef.current) {
          clearTimeout(staleTimerRef.current);
          staleTimerRef.current = null;
        }
        if (failed.length > 0 && generated.length === 0) {
          toast.error(
            "No images were generated — every attempt failed. This usually means the platform's AI image provider isn't configured; contact VYNU support.",
          );
        } else if (failed.length > 0) {
          toast.error(`${failed.length} image(s) failed to generate`);
        }
        if (generated.length > 0) {
          toast.success(`${generated.length} image(s) generated successfully`);
        }
        onComplete();
      }, 3000);
    }
    return () => {};
  }, [genProcessing, venueId, onComplete, dispatchGeneration]);

  const runGeneration = useCallback(async () => {
    if (missingImageItems.length === 0) return;

    setGenProcessing(true);
    setGenResults([]);
    setGenProgress(0);
    setGenTotal(missingImageItems.length);

    try {
      await dispatchGeneration(missingImageItems.slice(0, 10));
      toast.info(`Generation started for ${missingImageItems.length} items. You can close this dialog.`);
    } catch (err: any) {
      console.error("Failed to start batch generation:", err);
      toast.error(`Failed to start generation: ${err.message || "Unknown error"}`);
      setGenProcessing(false);
    }
  }, [missingImageItems, dispatchGeneration]);

  // On dialog open, check if there's an active batch
  useEffect(() => {
    if (open && itemsInProgress.length > 0 && !genProcessing) {
      setGenProcessing(true);
      setGenTotal(itemsInProgress.length + missingImageItems.length);
      setTab("generate");
    }
  }, [open, itemsInProgress.length, missingImageItems.length, genProcessing]);

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
    // Images are already saved by the edge function — just close
    toast.success("Images have been saved to your menu");
    onComplete();
    onOpenChange(false);
    setGenResults([]);
  };

  const skipGenItem = async (itemId: string) => {
    await supabase.from("menu_items").update({ image_ai_status: "skipped" as any, image_url: null }).eq("id", itemId);
    setGenResults((prev) => prev.filter((r) => r.itemId !== itemId));
    toast.info("Image skipped — original removed");
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
                    <span className="text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Generating images in the background...
                    </span>
                    <span className="text-muted-foreground">{genProgress}/{genTotal}</span>
                  </div>
                  <Progress value={genTotal > 0 ? (genProgress / genTotal) * 100 : 0} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  You can close this dialog — generation will continue in the background.
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
                  <Button onClick={acceptGenSelected} disabled={genSelectedCount === 0}>
                    <Check className="h-4 w-4 mr-2" />Done
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
