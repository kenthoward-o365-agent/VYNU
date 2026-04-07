import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";

interface VenueTax {
  id: string;
  name: string;
  rate: number;
  tax_type: "percent" | "fixed" | "compound_percent";
  is_inclusive: boolean;
  display_order: number;
  is_active: boolean;
}

const TAX_PRESETS = [
  { label: "🇦🇺 Australia — GST 10% inclusive", taxes: [{ name: "GST", rate: 10, tax_type: "percent" as const, is_inclusive: true }] },
  { label: "🇬🇧 UK — VAT 20% inclusive", taxes: [{ name: "VAT", rate: 20, tax_type: "percent" as const, is_inclusive: true }] },
  { label: "🇪🇺 EU — VAT 19% inclusive", taxes: [{ name: "VAT", rate: 19, tax_type: "percent" as const, is_inclusive: true }] },
  { label: "🇨🇦 Canada — GST 5% + PST 7%", taxes: [
    { name: "GST", rate: 5, tax_type: "percent" as const, is_inclusive: false },
    { name: "PST", rate: 7, tax_type: "percent" as const, is_inclusive: false },
  ]},
  { label: "🇺🇸 US — Sales Tax 8.5%", taxes: [{ name: "Sales Tax", rate: 8.5, tax_type: "percent" as const, is_inclusive: false }] },
];

const TAX_TYPE_LABELS: Record<string, string> = {
  percent: "Percentage (%)",
  fixed: "Fixed Amount ($)",
  compound_percent: "Compound % (tax on tax)",
};

interface Props {
  venueId: string;
}

export default function TaxSettingsTab({ venueId }: Props) {
  const [taxes, setTaxes] = useState<VenueTax[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VenueTax | null>(null);
  const [form, setForm] = useState({
    name: "",
    rate: "",
    tax_type: "percent" as "percent" | "fixed" | "compound_percent",
    is_inclusive: true,
    is_active: true,
  });

  const fetchTaxes = async () => {
    const { data } = await supabase
      .from("venue_taxes" as any)
      .select("*")
      .eq("venue_id", venueId)
      .order("display_order");
    setTaxes((data as any as VenueTax[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTaxes(); }, [venueId]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", rate: "", tax_type: "percent", is_inclusive: true, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (tax: VenueTax) => {
    setEditing(tax);
    setForm({
      name: tax.name,
      rate: String(tax.rate),
      tax_type: tax.tax_type,
      is_inclusive: tax.is_inclusive,
      is_active: tax.is_active,
    });
    setDialogOpen(true);
  };

  const saveTax = async () => {
    const payload = {
      venue_id: venueId,
      name: form.name,
      rate: parseFloat(form.rate),
      tax_type: form.tax_type,
      is_inclusive: form.is_inclusive,
      is_active: form.is_active,
      display_order: editing ? editing.display_order : taxes.length,
    };

    if (editing) {
      const { error } = await (supabase.from("venue_taxes" as any) as any).update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Tax updated");
    } else {
      const { error } = await (supabase.from("venue_taxes" as any) as any).insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Tax added");
    }
    setDialogOpen(false);
    fetchTaxes();
  };

  const deleteTax = async (id: string) => {
    const { error } = await (supabase.from("venue_taxes" as any) as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tax removed");
    fetchTaxes();
  };

  const toggleActive = async (tax: VenueTax) => {
    await (supabase.from("venue_taxes" as any) as any).update({ is_active: !tax.is_active }).eq("id", tax.id);
    toast.success(tax.is_active ? "Tax disabled" : "Tax enabled");
    fetchTaxes();
  };

  const applyPreset = async (preset: typeof TAX_PRESETS[0]) => {
    // Delete existing taxes first
    if (taxes.length > 0) {
      await (supabase.from("venue_taxes" as any) as any).delete().eq("venue_id", venueId);
    }
    // Insert preset taxes
    const rows = preset.taxes.map((t, i) => ({
      venue_id: venueId,
      name: t.name,
      rate: t.rate,
      tax_type: t.tax_type,
      is_inclusive: t.is_inclusive,
      display_order: i,
      is_active: true,
    }));
    const { error } = await (supabase.from("venue_taxes" as any) as any).insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`Applied ${preset.label}`);
    fetchTaxes();
  };

  // Example calculation for $25.00
  const examplePrice = 25;
  const exampleTaxes = taxes.filter((t) => t.is_active);

  if (loading) return <p className="text-muted-foreground">Loading tax settings...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Tax Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Configure taxes for your jurisdiction. Taxes apply to all menu items.
          </p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Tax</Button>
      </div>

      {/* Quick Presets */}
      {taxes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Setup</CardTitle>
            <CardDescription>Select your country to apply the standard tax configuration</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {TAX_PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors text-left"
              >
                <span className="text-sm font-medium text-foreground">{preset.label}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {preset.taxes[0].is_inclusive ? "Inclusive" : "Exclusive"}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Current Taxes */}
      {taxes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Active Taxes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {taxes.map((tax) => (
              <div
                key={tax.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  tax.is_active ? "border-border" : "border-border/50 opacity-60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{tax.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {tax.tax_type === "fixed" ? `$${tax.rate}` : `${tax.rate}%`}
                    </Badge>
                    <Badge variant={tax.is_inclusive ? "secondary" : "default"} className="text-xs">
                      {tax.is_inclusive ? "Inclusive" : "Exclusive"}
                    </Badge>
                    {tax.tax_type === "compound_percent" && (
                      <Badge variant="outline" className="text-xs">Compound</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {TAX_TYPE_LABELS[tax.tax_type]}
                    {tax.is_inclusive ? " — included in menu prices" : " — added at checkout"}
                  </p>
                </div>
                <Switch checked={tax.is_active} onCheckedChange={() => toggleActive(tax)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(tax)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteTax(tax.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <Separator />

            {/* Example Calculation */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Example: $25.00 item
              </p>
              {exampleTaxes.map((tax) => {
                let taxAmount = 0;
                if (tax.tax_type === "percent" || tax.tax_type === "compound_percent") {
                  taxAmount = tax.is_inclusive
                    ? examplePrice * tax.rate / (100 + tax.rate)
                    : examplePrice * tax.rate / 100;
                } else {
                  taxAmount = tax.rate;
                }
                return (
                  <div key={tax.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {tax.name} ({tax.is_inclusive ? "incl." : "excl."})
                    </span>
                    <span className="font-medium text-foreground">${taxAmount.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {/* Preset switcher */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Switch to a preset:</p>
              <div className="flex flex-wrap gap-1">
                {TAX_PRESETS.map((preset, i) => (
                  <Button key={i} variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset(preset)}>
                    {preset.label.split("—")[0].trim()}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tax" : "Add Tax"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tax Name</Label>
              <Input
                placeholder="e.g. GST, VAT, Sales Tax, PST"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rate</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={form.tax_type === "fixed" ? "Amount ($)" : "Rate (%)"}
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={form.tax_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, tax_type: v as any }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                    <SelectItem value="compound_percent">Compound % (tax on tax)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <div>
                <p className="text-sm font-medium">Price Inclusive</p>
                <p className="text-xs text-muted-foreground">
                  {form.is_inclusive
                    ? "Tax is already included in menu prices (e.g. AU, UK, EU)"
                    : "Tax is added on top at checkout (e.g. US, Canada)"}
                </p>
              </div>
              <Switch
                checked={form.is_inclusive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_inclusive: v }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Enable or disable this tax</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

            <Button onClick={saveTax} className="w-full" disabled={!form.name || !form.rate}>
              {editing ? "Update Tax" : "Add Tax"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
