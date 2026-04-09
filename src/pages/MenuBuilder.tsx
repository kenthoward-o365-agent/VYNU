import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, GripVertical, UtensilsCrossed, Upload, Globe, FileText, Sparkles, Loader2, ImagePlus, X, Ban } from "lucide-react";
import ImageEnhancerDialog from "@/components/menu/ImageEnhancerDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatItemTaxBreakdown, type TaxConfig } from "@/lib/tax-utils";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  prep_time_minutes: number | null;
  allergens: string[] | null;
  dietary_tags: string[] | null;
  image_url: string | null;
  is_available: boolean | null;
  category_id: string | null;
  display_order: number | null;
  food_cost: number | null;
}

interface Category {
  id: string;
  name: string;
  display_order: number | null;
  is_active: boolean | null;
}

const allergenOptions = ["Gluten", "Dairy", "Nuts", "Shellfish", "Eggs", "Soy", "Fish", "Sesame"];
const dietaryOptions = ["Vegan", "Vegetarian", "Gluten Free", "Dairy Free", "Keto", "Halal"];

export default function MenuBuilder() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const { venue } = useVenue();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeDietaryFilters, setActiveDietaryFilters] = useState<string[]>([]);
  const [venueTaxes, setVenueTaxes] = useState<TaxConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<"url" | "pdf" | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importPdfBase64, setImportPdfBase64] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [form, setForm] = useState({
    name: "", description: "", price: "", prep_time_minutes: "",
    allergens: [] as string[], dietary_tags: [] as string[],
    category_id: "", food_cost: "", is_available: true, image_url: "" as string,
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  // Auto-open import dialog from sidebar link
  useEffect(() => {
    if (searchParams.get("import") === "true") {
      setImportMode(null);
      setImportDialogOpen(true);
      searchParams.delete("import");
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get("enhance") === "true") {
      setEnhanceDialogOpen(true);
      searchParams.delete("enhance");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const fetchData = async () => {
    if (!venue) return;
    const [itemsRes, catsRes, taxesRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("venue_id", venue.id).order("display_order"),
      supabase.from("menu_categories").select("*").eq("venue_id", venue.id).order("display_order"),
      supabase.from("venue_taxes" as any).select("*").eq("venue_id", venue.id).eq("is_active", true).order("display_order"),
    ]);
    setItems((itemsRes.data as MenuItem[]) || []);
    setCategories((catsRes.data as Category[]) || []);
    setVenueTaxes((taxesRes.data as any as TaxConfig[]) || []);
  };

  useEffect(() => { fetchData(); }, [venue]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ name: "", description: "", price: "", prep_time_minutes: "", allergens: [], dietary_tags: [], category_id: "", food_cost: "", is_available: true, image_url: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({
      name: item.name, description: item.description || "", price: String(item.price),
      prep_time_minutes: item.prep_time_minutes ? String(item.prep_time_minutes) : "",
      allergens: item.allergens || [], dietary_tags: item.dietary_tags || [],
      category_id: item.category_id || "", food_cost: item.food_cost ? String(item.food_cost) : "",
      is_available: item.is_available ?? true, image_url: item.image_url || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!venue) return;
    const payload = {
      venue_id: venue.id,
      name: form.name,
      description: form.description || null,
      price: parseFloat(form.price),
      prep_time_minutes: form.prep_time_minutes ? parseInt(form.prep_time_minutes) : null,
      allergens: form.allergens,
      dietary_tags: form.dietary_tags,
      category_id: form.category_id || null,
      food_cost: form.food_cost ? parseFloat(form.food_cost) : null,
      is_available: form.is_available,
      image_url: form.image_url || null,
    };

    if (editingItem) {
      const { error } = await supabase.from("menu_items").update(payload).eq("id", editingItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Item updated");
    } else {
      const { error } = await supabase.from("menu_items").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Item added");
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Item deleted");
    fetchData();
  };

  const toggleAvailable = async (id: string, current: boolean) => {
    await supabase.from("menu_items").update({ is_available: !current }).eq("id", id);
    toast.success(!current ? "Item is back on the menu" : "Item 86'd");
    fetchData();
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    if (!activeItem || !overItem) return;

    // Only reorder within same category
    if (activeItem.category_id !== overItem.category_id) return;

    const categoryId = activeItem.category_id;
    const groupItems = items
      .filter((i) => i.category_id === categoryId)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

    const oldIndex = groupItems.findIndex((i) => i.id === active.id);
    const newIndex = groupItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder array
    const reordered = [...groupItems];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Optimistic update
    const updatedItems = items.map((item) => {
      const idx = reordered.findIndex((r) => r.id === item.id);
      if (idx !== -1) return { ...item, display_order: idx };
      return item;
    });
    setItems(updatedItems);

    // Persist to DB
    const updates = reordered.map((item, idx) =>
      supabase.from("menu_items").update({ display_order: idx }).eq("id", item.id)
    );
    await Promise.all(updates);
  }, [items]);

  const addCategory = async () => {
    if (!venue || !newCatName.trim()) return;
    const { error } = await supabase.from("menu_categories").insert({ venue_id: venue.id, name: newCatName.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Category added");
    setNewCatName("");
    setCatDialogOpen(false);
    fetchData();
  };

  const handleImport = async () => {
    if (!venue) return;
    setImporting(true);
    try {
      const body: any = { venue_id: venue.id };
      if (importMode === "url") {
        body.url = importUrl;
      } else if (importPdfBase64) {
        body.pdf_base64 = importPdfBase64;
      } else {
        body.text = importText;
      }

      const { data, error } = await supabase.functions.invoke("import-menu", { body });

      if (error) { toast.error(error.message); return; }
      if (data?.error) { toast.error(data.error); return; }

      toast.success(`Imported ${data.items_created} items across ${data.categories_created} categories`);
      setImportDialogOpen(false);
      setImportMode(null);
      setImportUrl("");
      setImportText("");
      setImportPdfBase64(null);
      setImportFileName("");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("PDF must be under 10MB");
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(",")[1];
      setImportPdfBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setImportMode("pdf");
      handleFileSelect(file);
    }
  };

  const toggleTag = (arr: string[], tag: string) =>
    arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag];

  const getCategoryName = (catId: string | null) =>
    categories.find((c) => c.id === catId)?.name || "Uncategorized";

  const filterByDietary = (itemList: MenuItem[]) => {
    if (activeDietaryFilters.length === 0) return itemList;
    return itemList.filter((item) =>
      activeDietaryFilters.every((tag) => item.dietary_tags?.includes(tag))
    );
  };

  const margin = (price: string, cost: string) => {
    const p = parseFloat(price), c = parseFloat(cost);
    if (!p || !c) return null;
    return (((p - c) / p) * 100).toFixed(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Menu Builder</h2>
          <p className="text-muted-foreground">{items.length} items across {categories.length} categories</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Category name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
                <Button onClick={addCategory} className="w-full">Add Category</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
        </div>
      </div>

      {/* Dietary tag filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground mr-1">Filter:</span>
        {dietaryOptions.map((tag) => (
          <Badge
            key={tag}
            variant={activeDietaryFilters.includes(tag) ? "default" : "outline"}
            className={cn(
              "cursor-pointer select-none transition-colors",
              activeDietaryFilters.includes(tag)
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "hover:bg-accent"
            )}
            onClick={() =>
              setActiveDietaryFilters((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
              )
            }
          >
            {tag}
          </Badge>
        ))}
        {activeDietaryFilters.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setActiveDietaryFilters([])}>
            Clear
          </Button>
        )}
      </div>

      {/* Item list grouped by category */}
      {categories.length === 0 && items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No menu items yet</h3>
            <p className="text-muted-foreground mb-4">Start building your menu by adding categories and items</p>
            <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add First Item</Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-6">
            {/* Uncategorized items */}
            {(() => {
              const uncatItems = filterByDietary(items.filter((i) => !i.category_id)).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
              return uncatItems.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Uncategorized</h3>
                  <SortableContext items={uncatItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="grid gap-3">
                      {uncatItems.map((item) => (
                        <SortableItemCard key={item.id} item={item} taxes={venueTaxes} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleAvailable} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              ) : null;
            })()}
            {categories.map((cat) => {
              const catItems = items.filter((i) => i.category_id === cat.id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
              return (
                <div key={cat.id}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{cat.name}</h3>
                  {catItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No items in this category</p>
                  ) : (
                    <SortableContext items={catItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                      <div className="grid gap-3">
                        {catItems.map((item) => (
                          <SortableItemCard key={item.id} item={item} taxes={venueTaxes} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleAvailable} />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </div>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Item name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input type="number" step="0.01" placeholder="Price ($)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                {form.price && parseFloat(form.price) > 0 && venueTaxes.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatItemTaxBreakdown(parseFloat(form.price), venueTaxes)}
                  </p>
                )}
              </div>
              <Input type="number" placeholder="Prep time (min)" value={form.prep_time_minutes} onChange={(e) => setForm((f) => ({ ...f, prep_time_minutes: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="0.01" placeholder="Food cost ($)" value={form.food_cost} onChange={(e) => setForm((f) => ({ ...f, food_cost: e.target.value }))} />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {margin(form.price, form.food_cost) && <span>Margin: {margin(form.price, form.food_cost)}%</span>}
              </div>
            </div>
            <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Image Upload */}
            <div>
              <p className="text-sm font-medium mb-2">Item Image</p>
              {form.image_url ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border">
                  <img src={form.image_url} alt="Menu item" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                    className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label
                  className="flex flex-col items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors"
                >
                  {uploadingImage ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <ImagePlus className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Click to upload image</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !venue) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Image must be under 5MB");
                        return;
                      }
                      setUploadingImage(true);
                      const ext = file.name.split(".").pop() || "jpg";
                      const path = `menu-items/${venue.id}/${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("venue-assets").upload(path, file, { upsert: true });
                      if (error) {
                        toast.error("Upload failed: " + error.message);
                      } else {
                        const { data: urlData } = supabase.storage.from("venue-assets").getPublicUrl(path);
                        setForm((f) => ({ ...f, image_url: urlData.publicUrl }));
                        toast.success("Image uploaded");
                      }
                      setUploadingImage(false);
                    }}
                  />
                </label>
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Allergens</p>
              <div className="flex flex-wrap gap-2">
                {allergenOptions.map((a) => (
                  <Badge
                    key={a}
                    variant={form.allergens.includes(a) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setForm((f) => ({ ...f, allergens: toggleTag(f.allergens, a) }))}
                  >{a}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Dietary Tags</p>
              <div className="flex flex-wrap gap-2">
                {dietaryOptions.map((d) => (
                  <Badge
                    key={d}
                    variant={form.dietary_tags.includes(d) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setForm((f) => ({ ...f, dietary_tags: toggleTag(f.dietary_tags, d) }))}
                  >{d}</Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_available} onCheckedChange={(v) => setForm((f) => ({ ...f, is_available: v }))} />
              <span className="text-sm">{form.is_available ? "Available" : "86'd — Unavailable"}</span>
            </div>

            {!form.is_available && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <Ban className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">This item is currently 86'd and hidden from diners</span>
              </div>
            )}

            <Button onClick={handleSave} className="w-full" disabled={!form.name || !form.price}>
              {editingItem ? "Update Item" : "Add Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open);
        if (!open) { setImportMode(null); setImportPdfBase64(null); setImportFileName(""); setDragging(false); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Menu Import
            </DialogTitle>
          </DialogHeader>

          {!importMode ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Import your entire menu automatically. Just provide a source and AI will extract all items, categories, prices, allergens, and dietary tags.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">Drop a PDF menu here</p>
                <p className="text-xs text-muted-foreground mt-1">or choose an option below</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setImportMode("url")}
                  className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors"
                >
                  <Globe className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <p className="font-medium text-foreground">Website URL</p>
                    <p className="text-xs text-muted-foreground">Paste your menu page link</p>
                  </div>
                </button>
                <button
                  onClick={() => setImportMode("pdf")}
                  className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors"
                >
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <p className="font-medium text-foreground">Upload PDF</p>
                    <p className="text-xs text-muted-foreground">Or paste menu text</p>
                  </div>
                </button>
              </div>
            </div>
          ) : importMode === "url" ? (
            <div className="space-y-4">
              <div>
                <Label>Menu Page URL</Label>
                <Input
                  placeholder="https://myrestaurant.com/menu"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  We'll scrape the page and extract all menu items automatically
                </p>
              </div>
              <Button onClick={handleImport} disabled={!importUrl.trim() || importing} className="w-full">
                {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : <><Sparkles className="h-4 w-4 mr-2" />Import Menu</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setImportMode(null)} className="w-full">
                ← Back
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* PDF upload area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                  dragging ? "border-primary bg-primary/5" : importPdfBase64 ? "border-success bg-success/5" : "border-border"
                )}
                onClick={() => document.getElementById("pdf-input")?.click()}
              >
                {importPdfBase64 ? (
                  <>
                    <FileText className="h-8 w-8 mx-auto text-success mb-2" />
                    <p className="text-sm font-medium text-foreground">{importFileName}</p>
                    <p className="text-xs text-muted-foreground mt-1">Click or drop to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">Click or drop PDF here</p>
                    <p className="text-xs text-muted-foreground mt-1">Max 10MB</p>
                  </>
                )}
                <input
                  id="pdf-input"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or paste text</span></div>
              </div>

              <Textarea
                placeholder="Paste menu text here..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={5}
              />

              <Button
                onClick={handleImport}
                disabled={(!importPdfBase64 && !importText.trim()) || importing}
                className="w-full"
              >
                {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : <><Sparkles className="h-4 w-4 mr-2" />Import Menu</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setImportMode(null); setImportPdfBase64(null); setImportFileName(""); }} className="w-full">
                ← Back
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* AI Enhance Dialog */}
      {venue && (
        <ImageEnhancerDialog
          open={enhanceDialogOpen}
          onOpenChange={setEnhanceDialogOpen}
          venueId={venue.id}
          items={items as any}
          onComplete={fetchData}
        />
      )}
    </div>
  );
}

type ItemCardProps = {
  item: MenuItem;
  taxes: TaxConfig[];
  onEdit: (i: MenuItem) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, current: boolean) => void;
};

function SortableItemCard(props: ItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function ItemCard({ item, taxes, onEdit, onDelete, onToggle, dragHandleProps }: ItemCardProps & { dragHandleProps?: Record<string, any> }) {
  const taxBreakdown = taxes.length > 0 ? formatItemTaxBreakdown(Number(item.price), taxes) : "";
  return (
    <Card className={!item.is_available ? "opacity-60" : ""}>
      <CardContent className="flex items-center gap-4 py-3 px-4">
        <button type="button" className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground hover:text-foreground" {...dragHandleProps}>
          <GripVertical className="h-5 w-5" />
        </button>
        {item.image_url ? (
          <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 border border-border">
            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground truncate">{item.name}</span>
            {!item.is_available && <Badge variant="secondary" className="text-xs">86'd</Badge>}
          </div>
          {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {item.allergens?.map((a) => <Badge key={a} variant="outline" className="text-xs">{a}</Badge>)}
            {item.dietary_tags?.map((d) => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-foreground">${Number(item.price).toFixed(2)}</p>
          {taxBreakdown && <p className="text-[10px] text-muted-foreground">{taxBreakdown}</p>}
          {item.prep_time_minutes && <p className="text-xs text-muted-foreground">{item.prep_time_minutes} min</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={item.is_available ? "ghost" : "destructive"}
            size="icon"
            title={item.is_available ? "86 this item" : "Un-86 this item"}
            onClick={() => onToggle(item.id, item.is_available ?? true)}
          >
            <Ban className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

