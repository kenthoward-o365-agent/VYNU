import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Users, Mail, Phone, AlertTriangle, Pencil, Plus, Gift, Search, Receipt, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DinerWithVisits {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  allergens: string[];
  preferences: any;
  visit_count: number;
  last_visit: string | null;
  total_spend: number;
}

interface DinerOrder {
  id: string;
  order_id: string | null;
  visited_at: string;
  spend_excl_tax: number;
  points_awarded: number;
}

interface LoyaltyBalance {
  id: string;
  program_id: string;
  program_name: string;
  balance: number;
  tier: string | null;
}

interface LoyaltyProgram {
  id: string;
  name: string;
  program_type: string;
}

export default function Diners() {
  const { venue } = useVenue();
  const [diners, setDiners] = useState<DinerWithVisits[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingDiner, setEditingDiner] = useState<DinerWithVisits | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", email: "", phone: "", allergens: "" });
  const [saving, setSaving] = useState(false);

  // Loyalty state
  const [balances, setBalances] = useState<LoyaltyBalance[]>([]);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [adjustAmount, setAdjustAmount] = useState<Record<string, string>>({});
  const [adjustReason, setAdjustReason] = useState("");
  const [selectedProgramForNew, setSelectedProgramForNew] = useState("");
  const [dinerOrders, setDinerOrders] = useState<DinerOrder[]>([]);

  const fetchDiners = async () => {
    if (!venue) return;
    setLoading(true);
    const { data: visits } = await supabase
      .from("diner_visits")
      .select("diner_id, visited_at, spend_excl_tax, points_awarded" as any)
      .eq("venue_id", venue.id)
      .order("visited_at", { ascending: false });

    if (!visits || visits.length === 0) { setDiners([]); setLoading(false); return; }

    const dinerMap = new Map<string, { count: number; last: string; totalSpend: number }>();
    visits.forEach((v: any) => {
      const existing = dinerMap.get(v.diner_id);
      const spend = parseFloat(v.spend_excl_tax) || 0;
      if (!existing) dinerMap.set(v.diner_id, { count: 1, last: v.visited_at, totalSpend: spend });
      else { existing.count++; existing.totalSpend += spend; }
    });

    const dinerIds = Array.from(dinerMap.keys());
    const { data: profiles } = await supabase
      .from("diner_profiles")
      .select("*")
      .in("id", dinerIds);

    const result: DinerWithVisits[] = (profiles || []).map((p: any) => ({
      id: p.id,
      display_name: p.display_name,
      email: p.email,
      phone: p.phone,
      allergens: p.allergens || [],
      preferences: p.preferences,
      visit_count: dinerMap.get(p.id)?.count || 0,
      last_visit: dinerMap.get(p.id)?.last || null,
      total_spend: dinerMap.get(p.id)?.totalSpend || 0,
    }));

    result.sort((a, b) => b.visit_count - a.visit_count);
    setDiners(result);
    setLoading(false);
  };

  const fetchPrograms = async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("loyalty_programs")
      .select("id, name, program_type")
      .eq("venue_id", venue.id)
      .eq("is_active", true);
    setPrograms((data || []) as LoyaltyProgram[]);
  };

  useEffect(() => {
    fetchDiners();
    fetchPrograms();
  }, [venue]);

  const openEdit = async (diner: DinerWithVisits) => {
    setEditingDiner(diner);
    setEditForm({
      display_name: diner.display_name || "",
      email: diner.email || "",
      phone: diner.phone || "",
      allergens: (diner.allergens || []).join(", "),
    });
    setAdjustAmount({});
    setAdjustReason("");
    setSelectedProgramForNew("");
    setDinerOrders([]);

    // Fetch loyalty balances for this diner
    if (venue) {
      const { data } = await supabase
        .from("loyalty_balances")
        .select("id, program_id, balance, tier")
        .eq("diner_id", diner.id);

      const bals: LoyaltyBalance[] = (data || []).map((b: any) => {
        const prog = programs.find((p) => p.id === b.program_id);
        return { ...b, program_name: prog?.name || "Unknown Program" };
      });
      setBalances(bals);

      // Fetch order history for this diner at this venue
      const { data: orderData } = await supabase
        .from("diner_visits")
        .select("id, order_id, visited_at, spend_excl_tax, points_awarded" as any)
        .eq("diner_id", diner.id)
        .eq("venue_id", venue.id)
        .order("visited_at", { ascending: false });
      setDinerOrders((orderData || []).map((o: any) => ({
        id: o.id,
        order_id: o.order_id,
        visited_at: o.visited_at,
        spend_excl_tax: parseFloat(o.spend_excl_tax) || 0,
        points_awarded: parseFloat(o.points_awarded) || 0,
      })));
    }
  };

  const saveProfile = async () => {
    if (!editingDiner) return;
    setSaving(true);
    const allergens = editForm.allergens
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const { error } = await supabase
      .from("diner_profiles")
      .update({
        display_name: editForm.display_name || null,
        email: editForm.email || null,
        phone: editForm.phone || null,
        allergens,
      })
      .eq("id", editingDiner.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      fetchDiners();
      setEditingDiner((prev) =>
        prev ? { ...prev, display_name: editForm.display_name, email: editForm.email, phone: editForm.phone, allergens } : null
      );
    }
    setSaving(false);
  };

  const adjustBalance = async (balanceId: string, programId: string, currentBalance: number) => {
    const delta = parseFloat(adjustAmount[balanceId] || "0");
    if (!delta || !editingDiner) return;

    const newBalance = Math.max(0, currentBalance + delta);
    const { error } = await supabase
      .from("loyalty_balances")
      .update({ balance: newBalance })
      .eq("id", balanceId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Balance updated: ${delta > 0 ? "+" : ""}${delta} points` });
      setBalances((prev) => prev.map((b) => b.id === balanceId ? { ...b, balance: newBalance } : b));
      setAdjustAmount((prev) => ({ ...prev, [balanceId]: "" }));
    }
  };

  const enrollInProgram = async () => {
    if (!editingDiner || !selectedProgramForNew) return;
    const existing = balances.find((b) => b.program_id === selectedProgramForNew);
    if (existing) {
      toast({ title: "Already enrolled", description: "This diner is already in that program.", variant: "destructive" });
      return;
    }

    // Check for signup bonus
    const { data: progData } = await supabase
      .from("loyalty_programs")
      .select("rules, name")
      .eq("id", selectedProgramForNew)
      .single();

    const rules = (progData?.rules && typeof progData.rules === "object") ? progData.rules as any : {};
    const signupBonus = rules.signup_bonus || 0;

    const { data: inserted, error } = await supabase
      .from("loyalty_balances")
      .insert({
        diner_id: editingDiner.id,
        program_id: selectedProgramForNew,
        balance: signupBonus,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const prog = programs.find((p) => p.id === selectedProgramForNew);
      setBalances((prev) => [...prev, {
        id: inserted.id,
        program_id: selectedProgramForNew,
        program_name: prog?.name || "Program",
        balance: signupBonus,
        tier: null,
      }]);
      toast({ title: `Enrolled${signupBonus ? ` with ${signupBonus} bonus points` : ""}` });
      setSelectedProgramForNew("");
    }
  };

  const filtered = diners.filter((d) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (d.display_name || "").toLowerCase().includes(s)
      || (d.email || "").toLowerCase().includes(s)
      || (d.phone || "").toLowerCase().includes(s);
  });

  const unenrolledPrograms = programs.filter((p) => !balances.some((b) => b.program_id === p.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Diners</h2>
          <p className="text-muted-foreground">CRM — track guests who've dined at {venue?.name}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or phone..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {diners.length === 0 ? "No diner data yet. Diners will appear here once orders come in." : "No diners match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <Card key={d.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openEdit(d)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{d.display_name || "Anonymous Diner"}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {d.email}
                  </div>
                )}
                {d.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {d.phone}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{d.visit_count} visit{d.visit_count !== 1 ? "s" : ""}</span>
                  <span className="text-sm font-medium text-primary">${d.total_spend.toFixed(2)}</span>
                </div>
                {d.last_visit && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(d.last_visit).toLocaleDateString()}
                  </span>
                )}
                {d.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    {d.allergens.map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingDiner} onOpenChange={(open) => !open && setEditingDiner(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Diner: {editingDiner?.display_name || "Anonymous"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="profile" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="orders"><Receipt className="h-3.5 w-3.5 mr-1" />Orders</TabsTrigger>
              <TabsTrigger value="loyalty"><Gift className="h-3.5 w-3.5 mr-1" />Loyalty</TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>Display Name</Label>
                  <Input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Allergens (comma-separated)</Label>
                  <Input value={editForm.allergens} onChange={(e) => setEditForm({ ...editForm, allergens: e.target.value })} placeholder="e.g. Gluten, Dairy, Nuts" />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{editingDiner?.visit_count} visits</span>
                {editingDiner?.last_visit && (
                  <>
                    <span>·</span>
                    <span>Last visit: {new Date(editingDiner.last_visit).toLocaleDateString()}</span>
                  </>
                )}
              </div>

              <Button onClick={saveProfile} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders" className="space-y-4">
              {dinerOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No order history yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Spend (excl. tax)</p>
                      <p className="text-xl font-bold text-primary">${dinerOrders.reduce((s, o) => s + o.spend_excl_tax, 0).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total Points</p>
                      <p className="text-xl font-bold text-primary">{dinerOrders.reduce((s, o) => s + o.points_awarded, 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Orders</p>
                      <p className="text-xl font-bold">{dinerOrders.length}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {dinerOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border border-border text-sm">
                        <div>
                          <p className="font-medium">{new Date(o.visited_at).toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground">{new Date(o.visited_at).toLocaleTimeString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${o.spend_excl_tax.toFixed(2)}</p>
                          {o.points_awarded > 0 && (
                            <p className="text-xs text-primary">+{o.points_awarded} pts</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Loyalty Tab */}
            <TabsContent value="loyalty" className="space-y-4">
              {balances.length === 0 && unenrolledPrograms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No loyalty programs configured for this venue.</p>
              ) : (
                <>
                  {balances.map((b) => (
                    <div key={b.id} className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{b.program_name}</p>
                          {b.tier && <Badge variant="outline" className="text-xs mt-1">{b.tier}</Badge>}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{b.balance}</p>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Adjust Points (+ or -)</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 50 or -20"
                            value={adjustAmount[b.id] || ""}
                            onChange={(e) => setAdjustAmount((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => adjustBalance(b.id, b.program_id, b.balance)}
                          disabled={!adjustAmount[b.id] || parseFloat(adjustAmount[b.id]) === 0}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Enrol in a new program */}
                  {unenrolledPrograms.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Enrol in Program</p>
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <Select value={selectedProgramForNew} onValueChange={setSelectedProgramForNew}>
                              <SelectTrigger><SelectValue placeholder="Select program..." /></SelectTrigger>
                              <SelectContent>
                                {unenrolledPrograms.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button size="sm" onClick={enrollInProgram} disabled={!selectedProgramForNew}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Enrol
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
