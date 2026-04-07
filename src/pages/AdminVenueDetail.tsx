import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Settings, UtensilsCrossed, Users, Plus, Trash2, Eye, EyeOff, Gift, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  is_active: boolean;
}

interface MenuCategory {
  id: string;
  name: string;
  display_order: number | null;
  is_active: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  category_id: string | null;
  is_available: boolean;
}

const venueTypes = [
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "pub", label: "Pub" },
  { value: "fast_casual", label: "Fast Casual" },
  { value: "fine_dining", label: "Fine Dining" },
  { value: "food_truck", label: "Food Truck" },
  { value: "bottle_shop", label: "Bottle Shop" },
];

export default function AdminVenueDetail() {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", venue_type: "restaurant", address: "", city: "", state: "NSW",
    postcode: "", phone: "", email: "", group_id: "__none__",
    subscription_status: "trial", subscription_plan: "basic", subscription_notes: "",
  });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);

  // Group settings (for parent venues)
  const [groupSettings, setGroupSettings] = useState<{ global_diners: boolean; global_loyalty: boolean }>({ global_diners: false, global_loyalty: false });
  const [childVenues, setChildVenues] = useState<any[]>([]);
  const [savingGroupSettings, setSavingGroupSettings] = useState(false);

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newUserDialog, setNewUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", display_name: "", role: "staff" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Menu
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newItemDialog, setNewItemDialog] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", price: "", description: "", category_id: "" });

  const fetchVenue = async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await supabase.from("venues").select("*").eq("id", venueId).single();
    if (data) {
      setVenue(data);
      setForm({
        name: data.name, venue_type: data.venue_type, address: data.address || "",
        city: data.city || "", state: data.state || "NSW", postcode: data.postcode || "",
        phone: data.phone || "", email: data.email || "",
        group_id: data.group_id || "__none__",
        subscription_status: (data as any).subscription_status || "trial",
        subscription_plan: (data as any).subscription_plan || "basic",
        subscription_notes: (data as any).subscription_notes || "",
      });
      // If parent venue, fetch group settings and child venues
      if (data.venue_type === "parent" && data.group_id) {
        const { data: groupRow } = await supabase.from("venue_groups").select("settings").eq("id", data.group_id).single();
        const s = (groupRow?.settings && typeof groupRow.settings === "object") ? groupRow.settings as any : {};
        setGroupSettings({ global_diners: s.global_diners ?? false, global_loyalty: s.global_loyalty ?? false });

        const { data: children } = await supabase.from("venues").select("id, name, city, state, venue_type").eq("group_id", data.group_id).neq("id", venueId);
        setChildVenues(children || []);
      }
    }
    // Fetch groups
    const { data: groupData } = await supabase.from("venue_groups").select("id, name");
    setGroups((groupData || []) as { id: string; name: string }[]);
    setLoading(false);
  };

  const fetchStaff = async () => {
    if (!venueId) return;
    const { data } = await supabase.from("venue_staff").select("*").eq("venue_id", venueId);
    setStaff((data || []) as StaffMember[]);
  };

  const fetchMenu = async () => {
    if (!venueId) return;
    const [{ data: cats }, { data: itms }] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("venue_id", venueId).order("display_order"),
      supabase.from("menu_items").select("*").eq("venue_id", venueId).order("display_order"),
    ]);
    setCategories((cats || []) as MenuCategory[]);
    setItems((itms || []) as MenuItem[]);
  };

  useEffect(() => { fetchVenue(); fetchStaff(); fetchMenu(); }, [venueId]);

  const saveDetails = async () => {
    if (!venueId) return;
    setSaving(true);
    const { error } = await supabase.from("venues").update({
      name: form.name, venue_type: form.venue_type, address: form.address || null,
      city: form.city || null, state: form.state || null, postcode: form.postcode || null,
      phone: form.phone || null, email: form.email || null,
      group_id: form.group_id === "__none__" ? null : form.group_id,
      subscription_status: form.subscription_status,
      subscription_plan: form.subscription_plan,
      subscription_notes: form.subscription_notes || null,
    } as any).eq("id", venueId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Venue updated" });
    setSaving(false);
  };

  const createUser = async () => {
    if (!venueId || !newUser.email || !newUser.password) return;
    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newUser.email,
          password: newUser.password,
          venue_id: venueId,
          role: newUser.role,
          display_name: newUser.display_name || null,
        },
      });
      if (error) {
        // For FunctionsHttpError, parse the response body for the real message
        const msg = typeof error === "object" && "context" in error
          ? (await (error as any).context?.json?.())?.error || error.message
          : error.message;
        throw new Error(msg || "Failed to create user");
      }
      if (data?.error) throw new Error(data.error);
      toast({ title: "User created", description: `${newUser.email} added as ${newUser.role}` });
      setNewUserDialog(false);
      setNewUser({ email: "", password: "", display_name: "", role: "staff" });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error creating user", description: err.message || "Unknown error", variant: "destructive" });
    }
    setCreatingUser(false);
  };

  const addCategory = async () => {
    if (!venueId || !newCatName.trim()) return;
    const { error } = await supabase.from("menu_categories").insert({
      venue_id: venueId,
      name: newCatName.trim(),
      display_order: categories.length,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Category added" }); setNewCatName(""); fetchMenu(); }
  };

  const addItem = async () => {
    if (!venueId || !newItem.name.trim() || !newItem.price) return;
    const { error } = await supabase.from("menu_items").insert({
      venue_id: venueId,
      name: newItem.name.trim(),
      price: parseFloat(newItem.price),
      description: newItem.description || null,
      category_id: newItem.category_id || null,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Item added" }); setNewItem({ name: "", price: "", description: "", category_id: "" }); setNewItemDialog(false); fetchMenu(); }
  };

  const deleteCategory = async (id: string) => {
    await supabase.from("menu_categories").delete().eq("id", id);
    fetchMenu();
  };

  const deleteItem = async (id: string) => {
    await supabase.from("menu_items").delete().eq("id", id);
    fetchMenu();
  };

  if (loading) return <p className="text-muted-foreground p-6">Loading...</p>;
  if (!venue) return <p className="text-muted-foreground p-6">Venue not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/venues")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{venue.name}</h2>
          <p className="text-muted-foreground text-sm">Admin · Venue Management</p>
        </div>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details"><Settings className="h-3.5 w-3.5 mr-1" />Details</TabsTrigger>
          <TabsTrigger value="menu"><UtensilsCrossed className="h-3.5 w-3.5 mr-1" />Menu</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />Users</TabsTrigger>
        </TabsList>

        {/* ── DETAILS TAB ── */}
        <TabsContent value="details" className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader><CardTitle>Venue Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Venue name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Select value={form.venue_type} onValueChange={(v) => setForm({ ...form, venue_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{venueTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                <Input placeholder="Postcode" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Parent Company</Label>
                <Select value={form.group_id} onValueChange={(v) => setForm({ ...form, group_id: v })} disabled={form.venue_type === "parent"}>
                  <SelectTrigger className={`mt-1 ${form.venue_type === "parent" ? "opacity-50" : ""}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (Standalone)</SelectItem>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>Control access and billing status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.subscription_status} onValueChange={(v) => setForm({ ...form, subscription_status: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Plan</Label>
                  <Select value={form.subscription_plan} onValueChange={(v) => setForm({ ...form, subscription_plan: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.subscription_notes} onChange={(e) => setForm({ ...form, subscription_notes: e.target.value })} placeholder="Internal notes about this account..." className="mt-1" />
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveDetails} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </TabsContent>

        {/* ── MENU TAB ── */}
        <TabsContent value="menu" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Menu Categories & Items</h3>
            <Dialog open={newItemDialog} onOpenChange={setNewItemDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Add Item</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Menu Item</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="mt-1" /></div>
                  <div><Label>Price ($)</Label><Input type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} className="mt-1" /></div>
                  <div><Label>Description</Label><Textarea value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label>Category</Label>
                    <Select value={newItem.category_id || "__none__"} onValueChange={(v) => setNewItem({ ...newItem, category_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Uncategorised</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addItem} disabled={!newItem.name.trim() || !newItem.price} className="w-full">Add Item</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Add category */}
          <div className="flex items-end gap-2 max-w-sm">
            <div className="flex-1">
              <Label className="text-xs">New Category</Label>
              <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Mains" className="mt-1" />
            </div>
            <Button size="sm" onClick={addCategory} disabled={!newCatName.trim()}>Add</Button>
          </div>

          {/* Categories and items */}
          {categories.length === 0 && items.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No menu items yet. Add categories and items above.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => (
                <Card key={cat.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">{cat.name}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => deleteCategory(cat.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </CardHeader>
                  <CardContent>
                    {items.filter((i) => i.category_id === cat.id).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No items in this category.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.filter((i) => i.category_id === cat.id).map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                            <div>
                              <p className="text-sm font-medium">{item.name}</p>
                              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">${item.price.toFixed(2)}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {/* Uncategorised items */}
              {items.filter((i) => !i.category_id).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base text-muted-foreground">Uncategorised</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {items.filter((i) => !i.category_id).map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div><p className="text-sm font-medium">{item.name}</p></div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">${item.price.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── USERS TAB ── */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Staff & Admin Users</h3>
            <Dialog open={newUserDialog} onOpenChange={setNewUserDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Create User</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create User Account</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Display Name</Label><Input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} placeholder="Jane Smith" className="mt-1" /></div>
                  <div><Label>Email</Label><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="jane@venue.com" className="mt-1" /></div>
                  <div>
                    <Label>Password</Label>
                    <div className="relative mt-1">
                      <Input type={showPassword ? "text" : "password"} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Min 8 characters" className="pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createUser} disabled={!newUser.email || !newUser.password || newUser.password.length < 8 || creatingUser} className="w-full">
                    {creatingUser ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {staff.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No staff assigned to this venue yet.</CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((s) => (
                <Card key={s.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-sm">{s.display_name || "No name"}</p>
                      <p className="text-xs text-muted-foreground">{s.user_id.slice(0, 8)}...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.is_active ? "default" : "secondary"}>{s.role}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
