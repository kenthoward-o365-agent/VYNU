import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Tag, Trash2, Pencil } from "lucide-react";
import SectionLinks from "@/components/SectionLinks";
import { toast } from "sonner";

interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  modifier_percent: number;
  modifier_type: string;
  modifier_value: number;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[] | null;
  is_active: boolean | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
}

interface MenuCategory {
  id: string;
  name: string;
}

interface RuleItemCount {
  [ruleId: string]: { count: number; names: string[]; ids: string[] };
}

interface RuleTypeOption {
  value: string;
  label: string;
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyForm = {
  name: "", rule_type: "",
  modifier_type: "percent", modifier_value: "-10",
  start_time: "16:00", end_time: "18:00",
  days_of_week: [1, 2, 3, 4, 5] as number[],
  appliesTo: "all" as "all" | "selected",
  selectedItems: [] as string[],
};

export default function Pricing() {
  const { venue } = useVenue();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [ruleItems, setRuleItems] = useState<RuleItemCount>({});
  const [ruleTypes, setRuleTypes] = useState<RuleTypeOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchRuleTypes = async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("pricing_rule_types")
      .select("name, label")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("display_order");
    const types = (data || []).map((t: any) => ({ value: t.name, label: t.label }));
    setRuleTypes(types);
    if (types.length > 0 && !form.rule_type) {
      setForm(f => ({ ...f, rule_type: types[0].value }));
    }
  };

  useEffect(() => { fetchRuleTypes(); }, [venue]);

  const fetchRules = async () => {
    if (!venue) return;
    const { data } = await supabase.from("pricing_rules").select("*").eq("venue_id", venue.id).order("created_at");
    const rulesData = (data as PricingRule[]) || [];
    setRules(rulesData);

    if (rulesData.length > 0) {
      const { data: linkData } = await supabase
        .from("pricing_rule_items" as any)
        .select("pricing_rule_id, menu_item_id")
        .in("pricing_rule_id", rulesData.map(r => r.id));

      const links = (linkData || []) as any[];
      const itemIds = [...new Set(links.map(l => l.menu_item_id))];
      let itemNameMap: Record<string, string> = {};
      if (itemIds.length > 0) {
        const { data: items } = await supabase.from("menu_items").select("id, name").in("id", itemIds);
        (items || []).forEach((item: any) => { itemNameMap[item.id] = item.name; });
      }

      const counts: RuleItemCount = {};
      links.forEach((l: any) => {
        if (!counts[l.pricing_rule_id]) counts[l.pricing_rule_id] = { count: 0, names: [], ids: [] };
        counts[l.pricing_rule_id].count++;
        counts[l.pricing_rule_id].ids.push(l.menu_item_id);
        if (itemNameMap[l.menu_item_id]) counts[l.pricing_rule_id].names.push(itemNameMap[l.menu_item_id]);
      });
      setRuleItems(counts);
    }
  };

  const fetchMenuItems = async () => {
    if (!venue) return;
    const [{ data: cats }, { data: items }] = await Promise.all([
      supabase.from("menu_categories").select("id, name").eq("venue_id", venue.id).eq("is_active", true).order("display_order"),
      supabase.from("menu_items").select("id, name, price, category_id").eq("venue_id", venue.id).eq("is_available", true).order("display_order"),
    ]);
    setCategories((cats || []) as MenuCategory[]);
    setMenuItems((items || []) as MenuItem[]);
  };

  useEffect(() => { fetchRules(); }, [venue]);

  useEffect(() => {
    if (dialogOpen) fetchMenuItems();
  }, [dialogOpen]);

  const openAddDialog = () => {
    setEditingRule(null);
    setForm({ ...emptyForm, rule_type: ruleTypes[0]?.value || "" });
    setDialogOpen(true);
  };

  const openEditDialog = (rule: PricingRule) => {
    const itemInfo = ruleItems[rule.id];
    setEditingRule(rule);
    setForm({
      name: rule.name,
      rule_type: rule.rule_type,
      modifier_type: rule.modifier_type,
      modifier_value: String(rule.modifier_value),
      start_time: rule.start_time || "16:00",
      end_time: rule.end_time || "18:00",
      days_of_week: rule.days_of_week || [0, 1, 2, 3, 4, 5, 6],
      appliesTo: itemInfo && itemInfo.count > 0 ? "selected" : "all",
      selectedItems: itemInfo?.ids || [],
    });
    setDialogOpen(true);
  };

  const saveRule = async () => {
    if (!venue) return;
    const modValue = parseFloat(form.modifier_value);

    if (editingRule) {
      // Update existing rule
      const { error } = await supabase.from("pricing_rules").update({
        name: form.name,
        rule_type: form.rule_type as any,
        modifier_percent: form.modifier_type === "percent" ? modValue : 0,
        modifier_type: form.modifier_type,
        modifier_value: modValue,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        days_of_week: form.days_of_week,
      }).eq("id", editingRule.id);
      if (error) { toast.error(error.message); return; }

      // Re-sync item assignments: delete old, insert new
      await supabase.from("pricing_rule_items" as any).delete().eq("pricing_rule_id", editingRule.id);
      if (form.appliesTo === "selected" && form.selectedItems.length > 0) {
        const rows = form.selectedItems.map(itemId => ({
          pricing_rule_id: editingRule.id,
          menu_item_id: itemId,
        }));
        await supabase.from("pricing_rule_items" as any).insert(rows as any);
      }

      toast.success("Pricing rule updated");
    } else {
      // Insert new rule
      const { data, error } = await supabase.from("pricing_rules").insert({
        venue_id: venue.id,
        name: form.name,
        rule_type: form.rule_type as any,
        modifier_percent: form.modifier_type === "percent" ? modValue : 0,
        modifier_type: form.modifier_type,
        modifier_value: modValue,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        days_of_week: form.days_of_week,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }

      if (form.appliesTo === "selected" && form.selectedItems.length > 0 && data) {
        const rows = form.selectedItems.map(itemId => ({
          pricing_rule_id: data.id,
          menu_item_id: itemId,
        }));
        await supabase.from("pricing_rule_items" as any).insert(rows as any);
      }

      toast.success("Pricing rule added");
    }

    setDialogOpen(false);
    setEditingRule(null);
    fetchRules();
  };

  const toggleRule = async (id: string, current: boolean) => {
    await supabase.from("pricing_rules").update({ is_active: !current }).eq("id", id);
    fetchRules();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("pricing_rules").delete().eq("id", id);
    toast.success("Rule deleted");
    fetchRules();
  };

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter((d) => d !== day)
        : [...f.days_of_week, day],
    }));
  };

  const toggleItem = (itemId: string) => {
    setForm((f) => ({
      ...f,
      selectedItems: f.selectedItems.includes(itemId)
        ? f.selectedItems.filter(id => id !== itemId)
        : [...f.selectedItems, itemId],
    }));
  };

  const toggleCategory = (catId: string) => {
    const catItems = menuItems.filter(i => i.category_id === catId).map(i => i.id);
    const allSelected = catItems.every(id => form.selectedItems.includes(id));
    setForm((f) => ({
      ...f,
      selectedItems: allSelected
        ? f.selectedItems.filter(id => !catItems.includes(id))
        : [...new Set([...f.selectedItems, ...catItems])],
    }));
  };

  const grouped = categories.map(cat => ({
    ...cat,
    items: menuItems.filter(i => i.category_id === cat.id),
  })).filter(g => g.items.length > 0);

  const uncategorized = menuItems.filter(i => !i.category_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dynamic Pricing</h2>
          <p className="text-muted-foreground">{rules.length} pricing rules</p>
        </div>
        <Button onClick={openAddDialog}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
      </div>

      <SectionLinks
        items={[
          { key: "rule-types", label: "Rule Types", description: "Manage the rule categories available for pricing", icon: Tag, to: "/rule-types" },
        ]}
      />


      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingRule(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingRule ? "Edit Pricing Rule" : "Add Pricing Rule"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Rule name (e.g. Happy Hour)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Select value={form.rule_type} onValueChange={(v) => setForm((f) => ({ ...f, rule_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ruleTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div>
              <label className="text-sm font-medium mb-2 block">Modifier type</label>
              <Select value={form.modifier_type} onValueChange={(v) => setForm((f) => ({ ...f, modifier_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                  <SelectItem value="dollar">Dollar Amount ($)</SelectItem>
                  <SelectItem value="fixed">Fixed Price ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {form.modifier_type === "percent" ? "Modifier (%)" : form.modifier_type === "dollar" ? "Amount ($)" : "Fixed price ($)"}
              </label>
              <Input
                type="number"
                step={form.modifier_type === "percent" ? "1" : "0.01"}
                value={form.modifier_value}
                onChange={(e) => setForm((f) => ({ ...f, modifier_value: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.modifier_type === "percent" && "Use negative for discounts (e.g. -15 for 15% off)"}
                {form.modifier_type === "dollar" && "Use negative to subtract (e.g. -3 for $3 off)"}
                {form.modifier_type === "fixed" && "This overrides the item's base price during the active window"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Start time</label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">End time</label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Days</label>
              <div className="flex gap-1.5">
                {dayNames.map((d, i) => (
                  <Badge
                    key={i}
                    variant={form.days_of_week.includes(i) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleDay(i)}
                  >{d}</Badge>
                ))}
              </div>
            </div>

            {/* Applies to section */}
            <div>
              <label className="text-sm font-medium mb-2 block">Applies to</label>
              <div className="flex gap-2 mb-2">
                <Badge
                  variant={form.appliesTo === "all" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setForm(f => ({ ...f, appliesTo: "all", selectedItems: [] }))}
                >All items</Badge>
                <Badge
                  variant={form.appliesTo === "selected" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setForm(f => ({ ...f, appliesTo: "selected" }))}
                >Selected items</Badge>
              </div>

              {form.appliesTo === "selected" && (
                <ScrollArea className="h-48 border rounded-md p-2">
                  {grouped.map(group => {
                    const catItemIds = group.items.map(i => i.id);
                    const allChecked = catItemIds.every(id => form.selectedItems.includes(id));
                    const someChecked = catItemIds.some(id => form.selectedItems.includes(id));
                    return (
                      <div key={group.id} className="mb-3">
                        <div
                          className="flex items-center gap-2 cursor-pointer mb-1"
                          onClick={() => toggleCategory(group.id)}
                        >
                          <Checkbox
                            checked={allChecked}
                            className={someChecked && !allChecked ? "opacity-60" : ""}
                          />
                          <span className="text-sm font-medium text-foreground">{group.name}</span>
                          <span className="text-xs text-muted-foreground">({catItemIds.filter(id => form.selectedItems.includes(id)).length}/{catItemIds.length})</span>
                        </div>
                        <div className="ml-6 space-y-1">
                          {group.items.map(item => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 cursor-pointer"
                              onClick={() => toggleItem(item.id)}
                            >
                              <Checkbox checked={form.selectedItems.includes(item.id)} />
                              <span className="text-sm text-foreground">{item.name}</span>
                              <span className="text-xs text-muted-foreground">${Number(item.price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {uncategorized.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm font-medium text-foreground mb-1">Uncategorised</div>
                      <div className="ml-6 space-y-1">
                        {uncategorized.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 cursor-pointer"
                            onClick={() => toggleItem(item.id)}
                          >
                            <Checkbox checked={form.selectedItems.includes(item.id)} />
                            <span className="text-sm text-foreground">{item.name}</span>
                            <span className="text-xs text-muted-foreground">${Number(item.price).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {menuItems.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No menu items found</p>
                  )}
                </ScrollArea>
              )}
              {form.appliesTo === "selected" && form.selectedItems.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{form.selectedItems.length} item{form.selectedItems.length !== 1 ? "s" : ""} selected</p>
              )}
            </div>

            <Button onClick={saveRule} className="w-full" disabled={!form.name || (form.appliesTo === "selected" && form.selectedItems.length === 0)}>
              {editingRule ? "Save Changes" : "Add Rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No pricing rules</h3>
            <p className="text-muted-foreground mb-4">Set up dynamic pricing like happy hours and late-night specials</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => {
            const itemInfo = ruleItems[rule.id];
            return (
              <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
                <CardContent className="flex items-center gap-4 py-4 px-5">
                  <div className="flex-1 cursor-pointer" onClick={() => openEditDialog(rule)}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{rule.name}</span>
                      <Badge variant="secondary" className="text-xs capitalize">{ruleTypes.find(t => t.value === rule.rule_type)?.label || rule.rule_type.replace(/_/g, " ")}</Badge>
                      <Badge variant="outline" className="text-xs">
                        {itemInfo ? `${itemInfo.count} item${itemInfo.count !== 1 ? "s" : ""}` : "All items"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {rule.modifier_type === "fixed"
                        ? `$${Number(rule.modifier_value).toFixed(2)} fixed`
                        : rule.modifier_type === "dollar"
                          ? `${Number(rule.modifier_value) > 0 ? "+" : ""}$${Number(rule.modifier_value).toFixed(2)}`
                          : `${Number(rule.modifier_value || rule.modifier_percent) > 0 ? "+" : ""}${rule.modifier_value || rule.modifier_percent}%`}
                      {rule.start_time && rule.end_time && ` • ${rule.start_time}–${rule.end_time}`}
                      {rule.days_of_week && ` • ${rule.days_of_week.map((d) => dayNames[d]).join(", ")}`}
                    </p>
                    {itemInfo && itemInfo.names.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                        {itemInfo.names.join(", ")}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(rule)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Switch checked={rule.is_active ?? true} onCheckedChange={() => toggleRule(rule.id, rule.is_active ?? true)} />
                  <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
