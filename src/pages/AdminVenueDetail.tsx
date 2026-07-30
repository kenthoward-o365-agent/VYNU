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
import { ArrowLeft, Settings, Users, Plus, Eye, EyeOff, Gift, Building2, Trash2, DollarSign, CreditCard, BarChart3, Package } from "lucide-react";
import BillingConfigTab from "@/components/venue/BillingConfigTab";
import ProcessorCredentialsTab from "@/components/admin/ProcessorCredentialsTab";
import VenuePerformanceTab from "@/components/admin/VenuePerformanceTab";
import PackageFeaturesTab from "@/components/admin/PackageFeaturesTab";
import GroupLoyaltyManager from "@/components/venue/GroupLoyaltyManager";
import ChildVenueLoyaltyViewer from "@/components/venue/ChildVenueLoyaltyViewer";
import ShyndigLoyaltyEditor from "@/components/venue/ShyndigLoyaltyEditor";


import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  is_active: boolean;
  email?: string;
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

// Map legacy plan values to the new Bite/Plate/Feast tiers.
const PLAN_ALIASES: Record<string, string> = {
  basic: "bite", starter: "bite", bite: "bite",
  pro: "plate", standard: "plate", plate: "plate",
  enterprise: "feast", premium: "feast", feast: "feast",
};
function normalizePlan(value: unknown): string {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  return PLAN_ALIASES[v] || "bite";
}

export default function AdminVenueDetail() {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", venue_type: "restaurant", address: "", city: "", state: "NSW",
    postcode: "", phone: "", email: "", group_id: "__none__",
    subscription_status: "trial", subscription_plan: "bite", subscription_notes: "",
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

  // Edit user
  const [editUserDialog, setEditUserDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", role: "staff", password: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);


  const fetchVenue = async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await supabase.from("venues").select("id, name, venue_type, address, city, state, postcode, country, logo_url, operating_hours, timezone, settings, is_active, group_id, landing_page_html, site_id, menu_source, is_live, went_live_at, created_at, updated_at").eq("id", venueId).single();
    const { data: adminRows } = await supabase.rpc("get_venue_admin_detail", { _venue_id: venueId });
    const adminRow: any = Array.isArray(adminRows) ? adminRows[0] : null;
    if (data) {
      const merged: any = { ...data, ...(adminRow || {}) };
      setVenue(merged);
      setForm({
        name: data.name, venue_type: data.venue_type, address: data.address || "",
        city: data.city || "", state: data.state || "NSW", postcode: data.postcode || "",
        phone: adminRow?.phone || "", email: adminRow?.email || "",
        group_id: data.group_id || "__none__",
        subscription_status: adminRow?.subscription_status || "trial",
        subscription_plan: normalizePlan(adminRow?.subscription_plan),
        subscription_notes: adminRow?.subscription_notes || "",
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
    const list = (data || []) as StaffMember[];
    // Resolve emails
    if (list.length > 0) {
      try {
        const res = await supabase.functions.invoke("admin-create-user", {
          body: { action: "list_emails", user_ids: list.map((s) => s.user_id), venue_id: venueId },
        });
        const emails: Record<string, string> = res.data?.emails || {};
        list.forEach((s) => { s.email = emails[s.user_id]; });
      } catch { /* ignore */ }
    }
    setStaff(list);
  };


  useEffect(() => { fetchVenue(); fetchStaff(); }, [venueId]);

  const openEditUser = (s: StaffMember) => {
    setEditingStaff(s);
    setEditForm({ display_name: s.display_name || "", role: s.role, password: "" });
    setShowEditPassword(false);
    setEditUserDialog(true);
  };

  const saveEditUser = async () => {
    if (!editingStaff || !venueId) return;
    setSavingEdit(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          action: "update",
          staff_id: editingStaff.id,
          venue_id: venueId,
          display_name: editForm.display_name,
          role: editForm.role,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Failed to update");

      if (editForm.password) {
        if (editForm.password.length < 8) throw new Error("Password must be at least 8 characters");
        const pw = await supabase.functions.invoke("admin-create-user", {
          body: { action: "set_password", staff_id: editingStaff.id, venue_id: venueId, password: editForm.password },
        });
        if (pw.error || pw.data?.error) throw new Error(pw.data?.error || pw.error?.message || "Failed to set password");
      }

      toast({ title: "User updated" });
      setEditUserDialog(false);
      setEditingStaff(null);
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSavingEdit(false);
  };

  const toggleActive = async (s: StaffMember) => {
    if (!venueId) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { action: "toggle_active", staff_id: s.id, venue_id: venueId, is_active: !s.is_active },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: s.is_active ? "User deactivated" : "User activated" });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteUser = async (s: StaffMember, deleteAuth: boolean) => {
    if (!venueId) return;
    if (!confirm(`Remove ${s.display_name || s.email || "this user"} from the venue?${deleteAuth ? "\n\nThis will ALSO delete their login account permanently." : ""}`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { action: "delete", staff_id: s.id, venue_id: venueId, delete_auth: deleteAuth },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "User removed" });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

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
    // Mirror the selected plan into the venue's feature-flag tier so the
    // Packages tab starts from the matching preset. Existing flag overrides
    // are preserved (we only write the tier column here).
    if (!error && ["bite", "plate", "feast"].includes(form.subscription_plan)) {
      const { data: existing } = await supabase
        .from("venue_feature_flags")
        .select("venue_id, flags")
        .eq("venue_id", venueId)
        .maybeSingle();
      await supabase
        .from("venue_feature_flags")
        .upsert(
          { venue_id: venueId, tier: form.subscription_plan, flags: (existing?.flags as any) ?? {} },
          { onConflict: "venue_id" },
        );
    }
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


  const saveGroupSettings = async () => {
    if (!venue?.group_id) return;
    setSavingGroupSettings(true);
    const { error } = await supabase.from("venue_groups").update({
      settings: { global_diners: groupSettings.global_diners, global_loyalty: groupSettings.global_loyalty },
    }).eq("id", venue.group_id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Group settings saved" });
    setSavingGroupSettings(false);
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
          <TabsTrigger value="performance"><BarChart3 className="h-3.5 w-3.5 mr-1" />Performance</TabsTrigger>
          {venue?.venue_type === "parent" && (
            <TabsTrigger value="group-settings"><Building2 className="h-3.5 w-3.5 mr-1" />Group Settings</TabsTrigger>
          )}
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />Users</TabsTrigger>
          <TabsTrigger value="package"><Package className="h-3.5 w-3.5 mr-1" />Package</TabsTrigger>
          <TabsTrigger value="billing"><DollarSign className="h-3.5 w-3.5 mr-1" />Commercials</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-3.5 w-3.5 mr-1" />Payments</TabsTrigger>
          <TabsTrigger value="loyalty"><Gift className="h-3.5 w-3.5 mr-1" />Loyalty</TabsTrigger>
          {venue?.group_id && (
            <TabsTrigger value="pubplus"><Beer className="h-3.5 w-3.5 mr-1" />Pub+</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="package">
          {venueId && <PackageFeaturesTab venueId={venueId} />}
        </TabsContent>

        {/* ── DETAILS TAB ── */}
        <TabsContent value="performance">
          {venueId && <VenuePerformanceTab venueId={venueId} />}
        </TabsContent>

        <TabsContent value="details" className="space-y-6 max-w-2xl">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Site ID</p>
                  <p className="font-mono text-lg font-bold text-foreground">{(venue as any).site_id || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Staff use this to log in to this venue</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText((venue as any).site_id || ""); toast({ title: "Site ID copied" }); }}>Copy</Button>
              </div>
            </CardContent>
          </Card>
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
                      <SelectItem value="bite">Bite</SelectItem>
                      <SelectItem value="plate">Plate</SelectItem>
                      <SelectItem value="feast">Feast</SelectItem>
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

        {/* ── GROUP SETTINGS TAB (parent venues only) ── */}
        {venue?.venue_type === "parent" && (
          <TabsContent value="group-settings" className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>Diner & Loyalty Settings</CardTitle>
                <CardDescription>Cross-venue behaviours for diners and loyalty across this group.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Global Diner Recognition</p>
                    <p className="text-xs text-muted-foreground">Diners signing up at one venue are recognised at every venue in this group — same profile, allergens and saved cards.</p>
                  </div>
                  <Switch checked={groupSettings.global_diners} onCheckedChange={(v) => setGroupSettings({ ...groupSettings, global_diners: v })} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Global Loyalty Pooling</p>
                    <p className="text-xs text-muted-foreground">Points earned at one venue can be redeemed at any sibling venue. Requires a group-level loyalty program.</p>
                  </div>
                  <Switch checked={groupSettings.global_loyalty} onCheckedChange={(v) => setGroupSettings({ ...groupSettings, global_loyalty: v })} />
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  → Configure your loyalty program (H&L OrderNOW Loyalty or your own custom programs) in the <strong>Loyalty</strong> tab.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Child Venues</CardTitle>
                <CardDescription>{childVenues.length} venue{childVenues.length !== 1 ? "s" : ""} assigned to this parent company.</CardDescription>
              </CardHeader>
              <CardContent>
                {childVenues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No child venues assigned yet. Assign venues from their detail page or the Manage Venues list.</p>
                ) : (
                  <div className="space-y-2">
                    {childVenues.map((cv) => (
                      <div key={cv.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{cv.name}</p>
                          <p className="text-xs text-muted-foreground">{cv.city || "—"}, {cv.state || "—"} · {cv.venue_type}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/venues/${cv.id}`)}>
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button onClick={saveGroupSettings} disabled={savingGroupSettings}>
              {savingGroupSettings ? "Saving..." : "Save Group Settings"}
            </Button>
          </TabsContent>
        )}

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
                <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{s.display_name || "No name"}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.email || `${s.user_id.slice(0, 8)}...`}</p>
                      </div>
                      <Badge variant={s.is_active ? "default" : "secondary"}>{s.role}</Badge>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditUser(s)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(s)}>
                        {s.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteUser(s, true)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Edit User Dialog */}
          <Dialog open={editUserDialog} onOpenChange={setEditUserDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
              </DialogHeader>
              {editingStaff && (
                <div className="space-y-3">
                  <div>
                    <Label>Email</Label>
                    <Input value={editingStaff.email || ""} disabled className="mt-1" />
                  </div>
                  <div>
                    <Label>Display Name</Label>
                    <Input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Reset Password (optional)</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showEditPassword ? "text" : "password"}
                        value={editForm.password}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        placeholder="Leave blank to keep current"
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowEditPassword(!showEditPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Min 8 characters if changing.</p>
                  </div>
                  <Button onClick={saveEditUser} disabled={savingEdit} className="w-full">
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="billing">
          <BillingConfigTab
            venueId={venueId!}
            venueType={venue.venue_type}
            groupId={venue.group_id}
            groupName={groups.find((g) => g.id === venue.group_id)?.name}
            childVenues={childVenues}
          />
        </TabsContent>

        <TabsContent value="payments">
          <ProcessorCredentialsTab venueId={venueId!} />
        </TabsContent>

        <TabsContent value="loyalty" className="space-y-6">
          {venue?.group_id ? (
            venue.venue_type === "parent" ? (
              <GroupLoyaltyManager groupId={venue.group_id} groupName={venue.name} />
            ) : (
              <ChildVenueLoyaltyViewer groupId={venue.group_id} venueName={venue.name} />
            )
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>H&L OrderNOW Loyalty</CardTitle>
                <CardDescription>
                  Configure the built-in H&L OrderNOW Loyalty program for {venue?.name}. To manage custom programs and toggle activation, the venue's operators can use the <strong>Loyalty</strong> tab in their dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ShyndigLoyaltyEditor scope={{ type: "venue", venue_id: venueId! }} menuVenueId={venueId!} defaultName="H&L OrderNOW Loyalty" />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
