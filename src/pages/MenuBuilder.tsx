import { useEffect, useState } from "react";
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
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

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
  const { venue } = useVenue();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [form, setForm] = useState({
    name: "", description: "", price: "", prep_time_minutes: "",
    allergens: [] as string[], dietary_tags: [] as string[],
    category_id: "", food_cost: "", is_available: true,
  });

  const fetchData = async () => {
    if (!venue) return;
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("venue_id", venue.id).order("display_order"),
      supabase.from("menu_categories").select("*").eq("venue_id", venue.id).order("display_order"),
    ]);
    setItems((itemsRes.data as MenuItem[]) || []);
    setCategories((catsRes.data as Category[]) || []);
  };

  useEffect(() => { fetchData(); }, [venue]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ name: "", description: "", price: "", prep_time_minutes: "", allergens: [], dietary_tags: [], category_id: "", food_cost: "", is_available: true });
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({
      name: item.name, description: item.description || "", price: String(item.price),
      prep_time_minutes: item.prep_time_minutes ? String(item.prep_time_minutes) : "",
      allergens: item.allergens || [], dietary_tags: item.dietary_tags || [],
      category_id: item.category_id || "", food_cost: item.food_cost ? String(item.food_cost) : "",
      is_available: item.is_available ?? true,
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
    fetchData();
  };

  const addCategory = async () => {
    if (!venue || !newCatName.trim()) return;
    const { error } = await supabase.from("menu_categories").insert({ venue_id: venue.id, name: newCatName.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Category added");
    setNewCatName("");
    setCatDialogOpen(false);
    fetchData();
  };

  const toggleTag = (arr: string[], tag: string) =>
    arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag];

  const getCategoryName = (catId: string | null) =>
    categories.find((c) => c.id === catId)?.name || "Uncategorized";

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
        <div className="flex gap-2">
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
        <div className="space-y-6">
          {/* Uncategorized items */}
          {items.filter((i) => !i.category_id).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Uncategorized</h3>
              <div className="grid gap-3">
                {items.filter((i) => !i.category_id).map((item) => (
                  <ItemCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleAvailable} />
                ))}
              </div>
            </div>
          )}
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category_id === cat.id);
            return (
              <div key={cat.id}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{cat.name}</h3>
                {catItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No items in this category</p>
                ) : (
                  <div className="grid gap-3">
                    {catItems.map((item) => (
                      <ItemCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleAvailable} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
              <Input type="number" step="0.01" placeholder="Price ($)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
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
              <span className="text-sm">Available</span>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={!form.name || !form.price}>
              {editingItem ? "Update Item" : "Add Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemCard({ item, onEdit, onDelete, onToggle }: {
  item: MenuItem;
  onEdit: (i: MenuItem) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, current: boolean) => void;
}) {
  return (
    <Card className={!item.is_available ? "opacity-60" : ""}>
      <CardContent className="flex items-center gap-4 py-3 px-4">
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
          {item.prep_time_minutes && <p className="text-xs text-muted-foreground">{item.prep_time_minutes} min</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Switch
            checked={item.is_available ?? true}
            onCheckedChange={() => onToggle(item.id, item.is_available ?? true)}
          />
          <Button variant="ghost" size="icon" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

