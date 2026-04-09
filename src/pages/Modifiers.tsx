import { useState, useEffect, useCallback } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles, Plus, Trash2, Pencil, Check, X, Loader2, GripVertical
} from "lucide-react";

type ModifierCategory = {
  id: string;
  venue_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
};

type Modifier = {
  id: string;
  venue_id: string;
  category_id: string;
  name: string;
  price: number;
  display_order: number;
  is_active: boolean;
};

type MenuItemModifier = {
  id: string;
  menu_item_id: string;
  modifier_category_id: string;
  is_required: boolean;
};

type MenuItem = {
  id: string;
  name: string;
  category_id: string | null;
};

type AISuggestion = {
  name: string;
  modifiers: { name: string; price: number }[];
  suggested_items: string[];
  is_required: boolean;
  checked: boolean;
};

export default function Modifiers() {
  const { venue } = useVenue();
  const [categories, setCategories] = useState<ModifierCategory[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [assignments, setAssignments] = useState<MenuItemModifier[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // CRUD state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [editingModId, setEditingModId] = useState<string | null>(null);
  const [editingModName, setEditingModName] = useState("");
  const [editingModPrice, setEditingModPrice] = useState("");
  const [newModName, setNewModName] = useState("");
  const [newModPrice, setNewModPrice] = useState("0");

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiMenuItems, setAiMenuItems] = useState<{ id: string; name: string }[]>([]);
  const [savingAi, setSavingAi] = useState(false);

  const fetchData = useCallback(async () => {
    if (!venue) return;
    setLoading(true);
    const [catsRes, modsRes, assignRes, itemsRes] = await Promise.all([
      supabase.from("modifier_categories").select("*").eq("venue_id", venue.id).order("display_order"),
      supabase.from("modifiers").select("*").eq("venue_id", venue.id).order("display_order"),
      supabase.from("menu_item_modifiers").select("*"),
      supabase.from("menu_items").select("id, name, category_id").eq("venue_id", venue.id).order("name"),
    ]);
    setCategories(catsRes.data || []);
    setModifiers(modsRes.data || []);
    setAssignments(assignRes.data || []);
    setMenuItems(itemsRes.data || []);
    if (!selectedCatId && catsRes.data?.length) setSelectedCatId(catsRes.data[0].id);
    setLoading(false);
  }, [venue, selectedCatId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Category CRUD ──
  const addCategory = async () => {
    if (!venue || !newCatName.trim()) return;
    const { error } = await supabase.from("modifier_categories").insert({
      venue_id: venue.id, name: newCatName.trim(), display_order: categories.length
    });
    if (error) { toast.error("Failed to add category"); return; }
    setNewCatName("");
    toast.success("Category added");
    fetchData();
  };

  const updateCategory = async (id: string) => {
    if (!editingCatName.trim()) return;
    const { error } = await supabase.from("modifier_categories").update({ name: editingCatName.trim() }).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    setEditingCatId(null);
    toast.success("Updated");
    fetchData();
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("modifier_categories").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    if (selectedCatId === id) setSelectedCatId(null);
    toast.success("Deleted");
    fetchData();
  };

  // ── Modifier CRUD ──
  const addModifier = async () => {
    if (!venue || !selectedCatId || !newModName.trim()) return;
    const { error } = await supabase.from("modifiers").insert({
      venue_id: venue.id, category_id: selectedCatId, name: newModName.trim(),
      price: parseFloat(newModPrice) || 0, display_order: modifiers.filter(m => m.category_id === selectedCatId).length
    });
    if (error) { toast.error("Failed to add modifier"); return; }
    setNewModName(""); setNewModPrice("0");
    toast.success("Modifier added");
    fetchData();
  };

  const updateModifier = async (id: string) => {
    const { error } = await supabase.from("modifiers").update({
      name: editingModName.trim(), price: parseFloat(editingModPrice) || 0
    }).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    setEditingModId(null);
    toast.success("Updated");
    fetchData();
  };

  const deleteModifier = async (id: string) => {
    const { error } = await supabase.from("modifiers").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Deleted");
    fetchData();
  };

  // ── Assignment ──
  const toggleAssignment = async (menuItemId: string, catId: string) => {
    const existing = assignments.find(a => a.menu_item_id === menuItemId && a.modifier_category_id === catId);
    if (existing) {
      await supabase.from("menu_item_modifiers").delete().eq("id", existing.id);
    } else {
      await supabase.from("menu_item_modifiers").insert({ menu_item_id: menuItemId, modifier_category_id: catId, is_required: false });
    }
    fetchData();
  };

  const toggleRequired = async (assignmentId: string, current: boolean) => {
    await supabase.from("menu_item_modifiers").update({ is_required: !current }).eq("id", assignmentId);
    fetchData();
  };

  // ── AI Generate ──
  const runAiGenerate = async () => {
    if (!venue) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-modifiers", {
        body: { venue_id: venue.id }
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setAiLoading(false); return; }
      setAiSuggestions((data.suggestions || []).map((s: any) => ({ ...s, checked: true })));
      setAiMenuItems(data.menu_items || []);
      setAiDialogOpen(true);
    } catch (e: any) {
      toast.error(e.message || "AI generation failed");
    }
    setAiLoading(false);
  };

  const acceptAiSuggestions = async () => {
    if (!venue) return;
    setSavingAi(true);
    let totalCats = 0, totalMods = 0;
    for (const sug of aiSuggestions) {
      if (!sug.checked) continue;
      // Create category
      const { data: catData, error: catErr } = await supabase.from("modifier_categories")
        .insert({ venue_id: venue.id, name: sug.name, display_order: categories.length + totalCats })
        .select("id").single();
      if (catErr || !catData) { console.error(catErr); continue; }
      totalCats++;

      // Create modifiers
      const modPayloads = sug.modifiers.map((m, idx) => ({
        venue_id: venue.id, category_id: catData.id, name: m.name, price: m.price, display_order: idx
      }));
      const { error: modErr } = await supabase.from("modifiers").insert(modPayloads);
      if (!modErr) totalMods += modPayloads.length;

      // Create assignments
      const validItems = sug.suggested_items.filter(id => menuItems.some(mi => mi.id === id) || aiMenuItems.some(mi => mi.id === id));
      if (validItems.length > 0) {
        const assignPayloads = validItems.map(itemId => ({
          menu_item_id: itemId, modifier_category_id: catData.id, is_required: sug.is_required
        }));
        await supabase.from("menu_item_modifiers").insert(assignPayloads);
      }
    }
    toast.success(`Created ${totalCats} categories with ${totalMods} modifiers`);
    setAiDialogOpen(false);
    setAiSuggestions([]);
    setSavingAi(false);
    fetchData();
  };

  const selectedCatModifiers = modifiers.filter(m => m.category_id === selectedCatId);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Modifiers</h2>
          <p className="text-sm text-muted-foreground">Manage modifier categories, options, and assign them to menu items.</p>
        </div>
        <Button onClick={runAiGenerate} disabled={aiLoading} className="gap-2">
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI Generate
        </Button>
      </div>

      <Tabs defaultValue="manage">
        <TabsList>
          <TabsTrigger value="manage">Categories & Modifiers</TabsTrigger>
          <TabsTrigger value="assign">Assign to Items</TabsTrigger>
        </TabsList>

        {/* ── Manage Tab ── */}
        <TabsContent value="manage" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Categories list */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="New category name" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCategory()} className="text-sm" />
                  <Button size="sm" onClick={addCategory} disabled={!newCatName.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
                <Separator />
                <ScrollArea className="h-[400px]">
                  {categories.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No categories yet. Add one or use AI Generate.</p>}
                  {categories.map(cat => (
                    <div key={cat.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${selectedCatId === cat.id ? 'bg-accent' : 'hover:bg-muted'}`}
                      onClick={() => setSelectedCatId(cat.id)}
                    >
                      {editingCatId === cat.id ? (
                        <>
                          <Input value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && updateCategory(cat.id)} className="text-sm h-7 flex-1" autoFocus />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateCategory(cat.id)}><Check className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCatId(null)}><X className="h-3 w-3" /></Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm flex-1 truncate">{cat.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{modifiers.filter(m => m.category_id === cat.id).length}</Badge>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Modifiers in selected category */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {selectedCatId ? `Modifiers — ${categories.find(c => c.id === selectedCatId)?.name}` : "Select a category"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedCatId ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input placeholder="Modifier name" value={newModName} onChange={e => setNewModName(e.target.value)} className="text-sm" />
                      <Input placeholder="Price" type="number" step="0.01" value={newModPrice} onChange={e => setNewModPrice(e.target.value)} className="text-sm w-24" />
                      <Button size="sm" onClick={addModifier} disabled={!newModName.trim()}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <Separator />
                    <ScrollArea className="h-[360px]">
                      {selectedCatModifiers.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No modifiers in this category yet.</p>}
                      {selectedCatModifiers.map(mod => (
                        <div key={mod.id} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted">
                          {editingModId === mod.id ? (
                            <>
                              <Input value={editingModName} onChange={e => setEditingModName(e.target.value)} className="text-sm h-7 flex-1" autoFocus />
                              <Input value={editingModPrice} onChange={e => setEditingModPrice(e.target.value)} type="number" step="0.01" className="text-sm h-7 w-20" />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateModifier(mod.id)}><Check className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingModId(null)}><X className="h-3 w-3" /></Button>
                            </>
                          ) : (
                            <>
                              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm flex-1">{mod.name}</span>
                              {mod.price > 0 && <Badge variant="outline" className="text-[10px]">+${mod.price.toFixed(2)}</Badge>}
                              {mod.price === 0 && <Badge variant="secondary" className="text-[10px]">Free</Badge>}
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingModId(mod.id); setEditingModName(mod.name); setEditingModPrice(String(mod.price)); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteModifier(mod.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Select a category on the left to manage its modifiers.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Assign Tab ── */}
        <TabsContent value="assign" className="mt-4">
          {categories.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Create modifier categories first, then assign them to menu items.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Menu Item</th>
                        {categories.map(cat => (
                          <th key={cat.id} className="text-center py-2 px-2 font-medium text-muted-foreground min-w-[120px]">
                            <div className="text-xs">{cat.name}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {menuItems.map(item => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 pr-4 font-medium">{item.name}</td>
                          {categories.map(cat => {
                            const assignment = assignments.find(a => a.menu_item_id === item.id && a.modifier_category_id === cat.id);
                            return (
                              <td key={cat.id} className="text-center py-2 px-2">
                                <div className="flex flex-col items-center gap-1">
                                  <Checkbox
                                    checked={!!assignment}
                                    onCheckedChange={() => toggleAssignment(item.id, cat.id)}
                                  />
                                  {assignment && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-muted-foreground">{assignment.is_required ? "Req" : "Opt"}</span>
                                      <Switch
                                        checked={assignment.is_required}
                                        onCheckedChange={() => toggleRequired(assignment.id, assignment.is_required)}
                                        className="scale-50"
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* AI Review Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Modifier Suggestions
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {aiSuggestions.map((sug, idx) => (
                <Card key={idx} className={sug.checked ? "" : "opacity-50"}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={sug.checked} onCheckedChange={(checked) => {
                        setAiSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, checked: !!checked } : s));
                      }} className="mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{sug.name}</span>
                          <Badge variant={sug.is_required ? "default" : "secondary"} className="text-[10px]">
                            {sug.is_required ? "Required" : "Optional"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {sug.modifiers.map((m, mi) => (
                            <Badge key={mi} variant="outline" className="text-xs">
                              {m.name}{m.price > 0 ? ` +$${m.price.toFixed(2)}` : ""}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Applies to: {sug.suggested_items.map(id => {
                            const item = aiMenuItems.find(mi => mi.id === id);
                            return item?.name || id;
                          }).join(", ")}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>Cancel</Button>
            <Button onClick={acceptAiSuggestions} disabled={savingAi || !aiSuggestions.some(s => s.checked)}>
              {savingAi ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Accept Selected ({aiSuggestions.filter(s => s.checked).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
