import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Gift, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface LoyaltyProgram {
  id: string;
  name: string;
  program_type: string;
  rules: any;
  is_active: boolean;
}

export default function Loyalty() {
  const { venue } = useVenue();
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", program_type: "points" as string });

  const fetchPrograms = async () => {
    if (!venue) return;
    setLoading(true);
    const { data } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("venue_id", venue.id)
      .order("created_at");
    setPrograms((data || []) as LoyaltyProgram[]);
    setLoading(false);
  };

  useEffect(() => { fetchPrograms(); }, [venue]);

  const createProgram = async () => {
    if (!venue || !form.name.trim()) return;
    const { error } = await supabase.from("loyalty_programs").insert({
      venue_id: venue.id,
      name: form.name.trim(),
      program_type: form.program_type as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Program created" });
    setForm({ name: "", program_type: "points" });
    setDialogOpen(false);
    fetchPrograms();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("loyalty_programs").update({ is_active: !current }).eq("id", id);
    fetchPrograms();
  };

  const deleteProgram = async (id: string) => {
    await supabase.from("loyalty_programs").delete().eq("id", id);
    toast({ title: "Program deleted" });
    fetchPrograms();
  };

  const typeLabel = (t: string) => t === "points" ? "Points" : t === "stamps" ? "Stamps" : "Tier";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Loyalty</h2>
          <p className="text-muted-foreground">Manage loyalty programs for {venue?.name}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Program</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Loyalty Program</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Program Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rewards Club" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.program_type} onValueChange={(v) => setForm({ ...form, program_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="points">Points</SelectItem>
                    <SelectItem value="stamps">Stamps</SelectItem>
                    <SelectItem value="tier">Tier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createProgram} className="w-full">Create Program</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No loyalty programs yet. Create one to start rewarding diners.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Type: {typeLabel(p.program_type)}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={p.is_active ?? false} onCheckedChange={() => toggleActive(p.id, p.is_active)} />
                    <span className="text-xs text-muted-foreground">{p.is_active ? "Active" : "Paused"}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteProgram(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
