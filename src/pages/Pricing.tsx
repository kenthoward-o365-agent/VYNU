import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  modifier_percent: number;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[] | null;
  is_active: boolean | null;
}

const ruleTypes = [
  { value: "happy_hour", label: "Happy Hour" },
  { value: "late_night", label: "Late Night" },
  { value: "special", label: "Special/Promo" },
  { value: "event", label: "Event" },
  { value: "weather", label: "Weather-Based" },
];

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Pricing() {
  const { venue } = useVenue();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", rule_type: "happy_hour", modifier_percent: "-10",
    start_time: "16:00", end_time: "18:00",
    days_of_week: [1, 2, 3, 4, 5] as number[],
  });

  const fetchRules = async () => {
    if (!venue) return;
    const { data } = await supabase.from("pricing_rules").select("*").eq("venue_id", venue.id).order("created_at");
    setRules((data as PricingRule[]) || []);
  };

  useEffect(() => { fetchRules(); }, [venue]);

  const addRule = async () => {
    if (!venue) return;
    const { error } = await supabase.from("pricing_rules").insert({
      venue_id: venue.id,
      name: form.name,
      rule_type: form.rule_type as any,
      modifier_percent: parseFloat(form.modifier_percent),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      days_of_week: form.days_of_week,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pricing rule added");
    setDialogOpen(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dynamic Pricing</h2>
          <p className="text-muted-foreground">{rules.length} pricing rules</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Pricing Rule</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Rule name (e.g. Happy Hour)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Select value={form.rule_type} onValueChange={(v) => setForm((f) => ({ ...f, rule_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ruleTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div>
                <label className="text-sm font-medium">Price modifier (%)</label>
                <Input type="number" value={form.modifier_percent} onChange={(e) => setForm((f) => ({ ...f, modifier_percent: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Use negative for discounts (e.g. -15 for 15% off)</p>
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
              <Button onClick={addRule} className="w-full" disabled={!form.name}>Add Rule</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 py-4 px-5">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{rule.name}</span>
                    <Badge variant="secondary" className="text-xs capitalize">{rule.rule_type.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {Number(rule.modifier_percent) > 0 ? "+" : ""}{rule.modifier_percent}%
                    {rule.start_time && rule.end_time && ` • ${rule.start_time}–${rule.end_time}`}
                    {rule.days_of_week && ` • ${rule.days_of_week.map((d) => dayNames[d]).join(", ")}`}
                  </p>
                </div>
                <Switch checked={rule.is_active ?? true} onCheckedChange={() => toggleRule(rule.id, rule.is_active ?? true)} />
                <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
