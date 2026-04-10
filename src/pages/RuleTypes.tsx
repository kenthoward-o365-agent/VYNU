import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Tag, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

interface RuleType {
  id: string;
  name: string;
  label: string;
  is_active: boolean;
  display_order: number;
}

export default function RuleTypes() {
  const { venue } = useVenue();
  const [types, setTypes] = useState<RuleType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RuleType | null>(null);
  const [form, setForm] = useState({ name: "", label: "" });

  const fetchTypes = async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("pricing_rule_types")
      .select("*")
      .eq("venue_id", venue.id)
      .order("display_order");
    setTypes((data as RuleType[]) || []);
  };

  useEffect(() => { fetchTypes(); }, [venue]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", label: "" });
    setDialogOpen(true);
  };

  const openEdit = (t: RuleType) => {
    setEditing(t);
    setForm({ name: t.name, label: t.label });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!venue || !form.label.trim()) return;
    const slug = form.name.trim() || form.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const payload = {
      venue_id: venue.id,
      name: slug,
      label: form.label.trim(),
    };

    if (editing) {
      const { error } = await supabase.from("pricing_rule_types").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Rule type updated");
    } else {
      const { error } = await supabase.from("pricing_rule_types").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Rule type created");
    }
    setDialogOpen(false);
    fetchTypes();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("pricing_rule_types").update({ is_active: !current }).eq("id", id);
    fetchTypes();
  };

  const deleteType = async (id: string) => {
    await supabase.from("pricing_rule_types").delete().eq("id", id);
    toast.success("Rule type deleted");
    fetchTypes();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Rule Types</h2>
          <p className="text-muted-foreground">Manage pricing rule categories (e.g. Happy Hour, Late Night, Special)</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rule Type</Button>
      </div>

      {types.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No rule types</h3>
            <p className="text-muted-foreground mb-4">Create rule types like Happy Hour, Late Night, or Special to categorise your pricing rules</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {types.map((t) => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 py-4 px-5">
                <Tag className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-foreground">{t.label}</span>
                  <p className="text-sm text-muted-foreground">{t.name}</p>
                </div>
                <Switch
                  checked={t.is_active}
                  onCheckedChange={() => toggleActive(t.id, t.is_active)}
                />
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteType(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Rule Type" : "Add Rule Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Label</Label>
              <Input
                placeholder="e.g. Happy Hour, Late Night"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Slug (auto-generated)</Label>
              <Input
                placeholder="auto-generated from label"
                value={form.name || form.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1">Internal identifier used in pricing rules</p>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={!form.label.trim()}>
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
