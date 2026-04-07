import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useVenue } from "@/contexts/VenueContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Paintbrush, Settings, Users, Plus, Eye, EyeOff, Pencil, Trash2, Gift, Search, Mail, Phone, DollarSign, Sparkles, Cake, Star, Award, Settings2, CreditCard } from "lucide-react";
import PaymentSettingsTab from "@/components/venue/PaymentSettingsTab";

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

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  is_active: boolean;
}

export default function VenueSettings() {
  const { venue, venueRole, isTablessAdmin, refetch } = useVenue();
  const { user, session } = useAuth();
  const navigate = useNavigate();

  const isOwner = venueRole === "owner" || isTablessAdmin;
  const isManager = isOwner || venueRole === "manager";

  const [form, setForm] = useState({
    name: "", venue_type: "restaurant", address: "", city: "", state: "NSW",
    postcode: "", phone: "", email: "",
  });
  const [loading, setLoading] = useState(false);

  // Staff state
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Create user dialog
  const [createDialog, setCreateDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", display_name: "", role: "staff" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit user dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", role: "staff" });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (venue) {
      setForm({
        name: venue.name, venue_type: venue.venue_type, address: venue.address || "",
        city: venue.city || "", state: venue.state || "NSW", postcode: venue.postcode || "",
        phone: venue.phone || "", email: venue.email || "",
      });
    }
  }, [venue]);

  

  useEffect(() => {
    if (venue && isManager && session) fetchStaff();
  }, [venue, isManager, session]);

  const [staffEmails, setStaffEmails] = useState<Record<string, string>>({});

  const fetchStaff = async () => {
    if (!venue) return;
    setStaffLoading(true);
    const { data } = await supabase.from("venue_staff").select("*").eq("venue_id", venue.id).order("created_at");
    const staffList = (data || []) as StaffMember[];
    setStaff(staffList);
    setStaffLoading(false);

    // Fetch emails for all staff user_ids
    const userIds = staffList.map((s) => s.user_id);
    if (userIds.length > 0) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) {
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({ action: "list_emails", user_ids: userIds, venue_id: venue.id }),
            }
          );
          const emailData = await resp.json();
          if (emailData?.emails) setStaffEmails(emailData.emails);
        }
      } catch {}
    }
  };

  const save = async () => {
    if (!venue) return;
    setLoading(true);
    const { error } = await supabase.from("venues").update(form).eq("id", venue.id);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); await refetch(); }
    setLoading(false);
  };

  const invokeUserFn = async (body: any) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Not authenticated. Please sign in again.");

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json();
    if (!resp.ok || data?.error) throw new Error(data?.error || `Request failed: ${resp.status}`);
    return data;
  };

  const createUser = async () => {
    if (!venue || !newUser.email || !newUser.password) return;
    setCreatingUser(true);
    try {
      await invokeUserFn({
        email: newUser.email, password: newUser.password,
        venue_id: venue.id, role: newUser.role, display_name: newUser.display_name || null,
      });
      toast.success(`${newUser.email} added as ${newUser.role}`);
      setCreateDialog(false);
      setNewUser({ email: "", password: "", display_name: "", role: "staff" });
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreatingUser(false);
  };

  const openEdit = (s: StaffMember) => {
    setEditStaff(s);
    setEditForm({ display_name: s.display_name || "", role: s.role });
    setEditDialog(true);
  };

  const saveEdit = async () => {
    if (!editStaff || !venue) return;
    setSavingEdit(true);
    try {
      await invokeUserFn({
        action: "update", staff_id: editStaff.id, venue_id: venue.id,
        display_name: editForm.display_name, role: editForm.role,
      });
      toast.success("User updated");
      setEditDialog(false);
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSavingEdit(false);
  };

  const toggleActive = async (s: StaffMember) => {
    if (!venue) return;
    try {
      await invokeUserFn({
        action: "toggle_active", staff_id: s.id, venue_id: venue.id, is_active: !s.is_active,
      });
      toast.success(s.is_active ? "User deactivated" : "User reactivated");
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const deleteStaff = async (s: StaffMember) => {
    if (!venue) return;
    try {
      await invokeUserFn({
        action: "delete", staff_id: s.id, venue_id: venue.id,
      });
      toast.success("User removed from venue");
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const roleOptions = isOwner
    ? [{ value: "owner", label: "Owner" }, { value: "manager", label: "Manager" }, { value: "staff", label: "Staff" }]
    : [{ value: "staff", label: "Staff" }];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Venue Settings</h2>
        <p className="text-muted-foreground">Manage your venue details and team</p>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details"><Settings className="h-3.5 w-3.5 mr-1" />Details</TabsTrigger>
          {isManager && <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />Users</TabsTrigger>}
          {isManager && venue?.group_id && <TabsTrigger value="loyalty"><Gift className="h-3.5 w-3.5 mr-1" />Loyalty</TabsTrigger>}
          {isManager && venue?.group_id && <TabsTrigger value="diners"><Users className="h-3.5 w-3.5 mr-1" />Diners</TabsTrigger>}
          {isManager && <TabsTrigger value="payments"><CreditCard className="h-3.5 w-3.5 mr-1" />Payments</TabsTrigger>}
        </TabsList>

        {/* ── DETAILS TAB ── */}
        <TabsContent value="details" className="space-y-6 max-w-2xl">
          {venue && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Venue ID</p>
                    <p className="font-mono text-sm text-foreground">{venue.id}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(venue.id); toast.success("Venue ID copied"); }}>Copy</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Venue Details</CardTitle>
              <CardDescription>Update your venue information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Venue name" value={form.name} onChange={(e) => update("name", e.target.value)} />
              <Select value={form.venue_type} onValueChange={(v) => update("venue_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{venueTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Address" value={form.address} onChange={(e) => update("address", e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} />
                <Input placeholder="State" value={form.state} onChange={(e) => update("state", e.target.value)} />
                <Input placeholder="Postcode" value={form.postcode} onChange={(e) => update("postcode", e.target.value)} />
              </div>
              <Input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              <Input type="email" placeholder="Email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              <Button onClick={save} disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Parent Company</CardTitle><CardDescription>Group affiliation for this venue</CardDescription></CardHeader>
            <CardContent>
              {venue?.group_id
                ? <p className="text-sm text-foreground">This venue belongs to a parent company. Manage group settings from the <strong>Parent Company</strong> page.</p>
                : <p className="text-sm text-muted-foreground">Not assigned to any parent company.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Diner Landing Page</CardTitle><CardDescription>Customise the page diners see when they scan your QR code</CardDescription></CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/settings/landing-page")}>
                <Paintbrush className="h-4 w-4 mr-2" /> Open Landing Page Editor
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USERS TAB ── */}
        {isManager && (
          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Staff & Users</h3>
                <p className="text-sm text-muted-foreground">{staff.length} member{staff.length !== 1 ? "s" : ""} at this venue</p>
              </div>

              {/* Create User Dialog */}
              <Dialog open={createDialog} onOpenChange={setCreateDialog}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Add User</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Staff User</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@example.com" className="mt-1" />
                    </div>
                    <div>
                      <Label>Password</Label>
                      <div className="relative mt-1">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="Min 8 characters"
                        />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">If the user already exists, they'll be added as staff to this venue.</p>
                    </div>
                    <div>
                      <Label>Display Name</Label>
                      <Input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} placeholder="Optional" className="mt-1" />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>Owner:</strong> Full access. <strong>Manager:</strong> Manage menu, staff, settings. <strong>Staff:</strong> View orders, tables.
                      </p>
                    </div>
                    <Button onClick={createUser} disabled={!newUser.email || !newUser.password || newUser.password.length < 8 || creatingUser} className="w-full">
                      {creatingUser ? "Creating..." : "Create User"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Staff Table */}
            {staffLoading ? (
              <p className="text-muted-foreground">Loading staff...</p>
            ) : staff.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No staff assigned yet. Click "Add User" to get started.</CardContent></Card>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((s) => {
                      const isSelf = s.user_id === user?.id;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div>
                             <p className="font-medium text-sm">
                                {s.display_name || "No name"}
                                {isSelf && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">{staffEmails[s.user_id] || s.user_id.slice(0, 12) + "..."}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{s.role}</Badge>
                          </TableCell>
                          <TableCell>
                            {s.is_active ? (
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/30" variant="outline">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!isSelf && (
                              <div className="flex items-center justify-end gap-1">
                                {/* Edit */}
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>

                                {/* Toggle Active */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 text-xs ${s.is_active ? "text-yellow-600" : "text-green-600"}`}
                                  onClick={() => toggleActive(s)}
                                >
                                  {s.is_active ? "Deactivate" : "Activate"}
                                </Button>

                                {/* Delete */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove user from venue?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will remove <strong>{s.display_name || "this user"}</strong> from this venue. Their auth account will remain — they can be re-added later.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteStaff(s)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        Remove User
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Edit User Dialog */}
            <Dialog open={editDialog} onOpenChange={setEditDialog}>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Display Name</Label>
                    <Input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      <strong>Owner:</strong> Full access including user management. <strong>Manager:</strong> Manage menu, settings, and staff. <strong>Staff:</strong> View-only for orders and tables.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
                  <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save Changes"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}

        {/* ── LOYALTY TAB ── */}
        {isManager && venue?.group_id && (
          <TabsContent value="loyalty" className="space-y-6">
            <VenueLoyaltyTab venueId={venue?.id} groupId={venue?.group_id} />
          </TabsContent>
        )}

        {/* ── DINERS TAB ── */}
        {isManager && venue?.group_id && (
          <TabsContent value="diners" className="space-y-6">
            <VenueDinersTab venueId={venue?.id} groupId={venue?.group_id} />
          </TabsContent>
        )}

        {/* ── PAYMENTS TAB ── */}
        {isManager && venue && (
          <TabsContent value="payments" className="space-y-6">
            <PaymentSettingsTab venueId={venue.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LOYALTY TAB (venue or group-scoped)
   ═══════════════════════════════════════════ */
interface LoyaltyRules {
  points_per_dollar?: number;
  signup_bonus?: number;
  birthday_reward?: { enabled: boolean; points?: number; discount_percent?: number; description?: string };
  anniversary_reward?: { enabled: boolean; points?: number; discount_percent?: number; description?: string };
  milestones?: { threshold: number; reward_type: "points" | "discount" | "free_item"; value: number; description: string }[];
}

interface LoyaltyProgram {
  id: string;
  name: string;
  program_type: string;
  rules: LoyaltyRules;
  is_active: boolean;
  group_id: string | null;
  venue_id: string | null;
}

const defaultRules: LoyaltyRules = {
  points_per_dollar: 1,
  signup_bonus: 0,
  birthday_reward: { enabled: false, points: 50, discount_percent: 10, description: "Happy Birthday!" },
  anniversary_reward: { enabled: false, points: 25, discount_percent: 5, description: "Thanks for being loyal!" },
  milestones: [],
};

function VenueLoyaltyTab({ venueId, groupId }: { venueId?: string; groupId?: string | null }) {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", program_type: "points" });
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);

  const scope = groupId ? "group" : "venue";
  const scopeId = groupId || venueId;

  const fetchPrograms = async () => {
    if (!scopeId) return;
    setLoading(true);
    let q = supabase.from("loyalty_programs").select("*").order("created_at");
    if (scope === "group") q = q.eq("group_id", scopeId);
    else q = q.eq("venue_id", scopeId);
    const { data } = await q;
    setPrograms((data || []).map((d: any) => ({ ...d, rules: (d.rules && typeof d.rules === "object" ? d.rules : {}) as LoyaltyRules })));
    setLoading(false);
  };

  useEffect(() => { fetchPrograms(); }, [scopeId]);

  const createProgram = async () => {
    if (!form.name.trim() || !scopeId) return;
    const insert: any = { name: form.name.trim(), program_type: form.program_type as any, rules: defaultRules as any };
    if (scope === "group") insert.group_id = scopeId;
    else insert.venue_id = scopeId;
    const { error } = await supabase.from("loyalty_programs").insert(insert);
    if (error) { toast.error(error.message); return; }
    toast.success("Loyalty program created");
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
    toast.success("Program deleted");
    fetchPrograms();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Loyalty Programs</h3>
          <p className="text-sm text-muted-foreground">
            {scope === "group"
              ? "These programs apply across all venues in the parent company."
              : "Loyalty programs for this venue."}
          </p>
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
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rewards Pass" />
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
        <Card><CardContent className="py-12 text-center"><Gift className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-muted-foreground">No loyalty programs yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => (
              <Card key={p.id} className={`cursor-pointer transition-all ${editingProgram?.id === p.id ? "ring-2 ring-primary" : "hover:border-primary/50"}`} onClick={() => setEditingProgram(p)}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Type: {p.program_type}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p.id, p.is_active)} onClick={(e) => e.stopPropagation()} />
                      <span className="text-xs text-muted-foreground">{p.is_active ? "Active" : "Paused"}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteProgram(p.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {editingProgram && (
            <LoyaltyRulesEditor
              program={editingProgram}
              onSave={(updated) => { setEditingProgram(updated); fetchPrograms(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LoyaltyRulesEditor({ program, onSave }: { program: LoyaltyProgram; onSave: (p: LoyaltyProgram) => void }) {
  const [rules, setRules] = useState<LoyaltyRules>({ ...defaultRules, ...program.rules });
  const [saving, setSaving] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ threshold: 100, reward_type: "discount" as const, value: 10, description: "Milestone reward" });

  useEffect(() => { setRules({ ...defaultRules, ...program.rules }); }, [program.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("loyalty_programs").update({ rules: rules as any }).eq("id", program.id);
    if (error) toast.error(error.message);
    else { toast.success("Rules saved"); onSave({ ...program, rules }); }
    setSaving(false);
  };

  const addMilestone = () => {
    setRules((prev) => ({ ...prev, milestones: [...(prev.milestones || []), { ...newMilestone }] }));
    setNewMilestone({ threshold: (newMilestone.threshold || 100) + 100, reward_type: "discount", value: 10, description: "Milestone reward" });
  };

  const removeMilestone = (idx: number) => {
    setRules((prev) => ({ ...prev, milestones: (prev.milestones || []).filter((_, i) => i !== idx) }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <div>
          <CardTitle className="text-lg">Configure: {program.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Set up earning rates, bonuses, and milestone rewards</p>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="earning" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="earning"><DollarSign className="h-3.5 w-3.5 mr-1" />Earning</TabsTrigger>
            <TabsTrigger value="signup"><Sparkles className="h-3.5 w-3.5 mr-1" />Sign Up</TabsTrigger>
            <TabsTrigger value="occasions"><Cake className="h-3.5 w-3.5 mr-1" />Occasions</TabsTrigger>
            <TabsTrigger value="milestones"><Award className="h-3.5 w-3.5 mr-1" />Milestones</TabsTrigger>
          </TabsList>

          <TabsContent value="earning" className="space-y-4">
            <div className="space-y-2">
              <Label>Points earned per $1 spent</Label>
              <Input type="number" min={0} step={0.5} value={rules.points_per_dollar ?? 1} onChange={(e) => setRules({ ...rules, points_per_dollar: parseFloat(e.target.value) || 0 })} />
            </div>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <div className="space-y-2">
              <Label>Sign-up bonus points</Label>
              <Input type="number" min={0} value={rules.signup_bonus ?? 0} onChange={(e) => setRules({ ...rules, signup_bonus: parseInt(e.target.value) || 0 })} />
            </div>
          </TabsContent>

          <TabsContent value="occasions" className="space-y-6">
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Cake className="h-4 w-4 text-primary" /><Label className="text-base font-medium">Birthday Reward</Label></div>
                <Switch checked={rules.birthday_reward?.enabled ?? false} onCheckedChange={(enabled) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, enabled } })} />
              </div>
              {rules.birthday_reward?.enabled && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Bonus Points</Label><Input type="number" min={0} value={rules.birthday_reward?.points ?? 50} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, points: parseInt(e.target.value) || 0 } })} /></div>
                    <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} value={rules.birthday_reward?.discount_percent ?? 10} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, discount_percent: parseInt(e.target.value) || 0 } })} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={rules.birthday_reward?.description ?? ""} onChange={(e) => setRules({ ...rules, birthday_reward: { ...rules.birthday_reward!, description: e.target.value } })} /></div>
                </div>
              )}
            </div>
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /><Label className="text-base font-medium">Anniversary Reward</Label></div>
                <Switch checked={rules.anniversary_reward?.enabled ?? false} onCheckedChange={(enabled) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, enabled } })} />
              </div>
              {rules.anniversary_reward?.enabled && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Bonus Points</Label><Input type="number" min={0} value={rules.anniversary_reward?.points ?? 25} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, points: parseInt(e.target.value) || 0 } })} /></div>
                    <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} value={rules.anniversary_reward?.discount_percent ?? 5} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, discount_percent: parseInt(e.target.value) || 0 } })} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={rules.anniversary_reward?.description ?? ""} onChange={(e) => setRules({ ...rules, anniversary_reward: { ...rules.anniversary_reward!, description: e.target.value } })} /></div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="space-y-4">
            <p className="text-sm text-muted-foreground">Set rewards that unlock at spending or visit milestones.</p>
            {(rules.milestones || []).map((m, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex-1 grid grid-cols-4 gap-2 items-end">
                  <div><Label className="text-xs">Threshold</Label><Input type="number" value={m.threshold} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], threshold: parseInt(e.target.value) || 0 }; setRules({ ...rules, milestones: ms }); }} /></div>
                  <div><Label className="text-xs">Reward</Label>
                    <Select value={m.reward_type} onValueChange={(v) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], reward_type: v as any }; setRules({ ...rules, milestones: ms }); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="points">Bonus Points</SelectItem><SelectItem value="discount">Discount %</SelectItem><SelectItem value="free_item">Free Item</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Value</Label><Input type="number" value={m.value} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], value: parseInt(e.target.value) || 0 }; setRules({ ...rules, milestones: ms }); }} /></div>
                  <div><Label className="text-xs">Description</Label><Input value={m.description} onChange={(e) => { const ms = [...(rules.milestones || [])]; ms[idx] = { ...ms[idx], description: e.target.value }; setRules({ ...rules, milestones: ms }); }} /></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeMilestone(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <Separator />
            <div className="p-3 rounded-lg border border-dashed border-border space-y-3">
              <p className="text-sm font-medium">Add Milestone</p>
              <div className="grid grid-cols-4 gap-2">
                <div><Label className="text-xs">Threshold</Label><Input type="number" value={newMilestone.threshold} onChange={(e) => setNewMilestone({ ...newMilestone, threshold: parseInt(e.target.value) || 0 })} /></div>
                <div><Label className="text-xs">Reward</Label>
                  <Select value={newMilestone.reward_type} onValueChange={(v) => setNewMilestone({ ...newMilestone, reward_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="points">Bonus Points</SelectItem><SelectItem value="discount">Discount %</SelectItem><SelectItem value="free_item">Free Item</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Value</Label><Input type="number" value={newMilestone.value} onChange={(e) => setNewMilestone({ ...newMilestone, value: parseInt(e.target.value) || 0 })} /></div>
                <div><Label className="text-xs">Description</Label><Input value={newMilestone.description} onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })} /></div>
              </div>
              <Button variant="outline" size="sm" onClick={addMilestone}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-6">
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Rules"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   DINERS TAB (venue or group-scoped)
   ═══════════════════════════════════════════ */
interface DinerRow {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  allergens: string[];
  visit_count: number;
  last_visit: string | null;
}

function VenueDinersTab({ venueId, groupId }: { venueId?: string; groupId?: string | null }) {
  const { venues } = useVenue();
  const [diners, setDiners] = useState<DinerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const scopeVenueIds = groupId
    ? venues.filter((v) => v.group_id === groupId).map((v) => v.id)
    : venueId ? [venueId] : [];

  useEffect(() => {
    if (scopeVenueIds.length === 0) { setDiners([]); setLoading(false); return; }
    const fetchDiners = async () => {
      setLoading(true);
      const { data: visits } = await supabase
        .from("diner_visits")
        .select("diner_id, visited_at")
        .in("venue_id", scopeVenueIds)
        .order("visited_at", { ascending: false });

      if (!visits || visits.length === 0) { setDiners([]); setLoading(false); return; }

      const dinerMap = new Map<string, { count: number; last: string }>();
      visits.forEach((v) => {
        const existing = dinerMap.get(v.diner_id);
        if (!existing) dinerMap.set(v.diner_id, { count: 1, last: v.visited_at });
        else existing.count++;
      });

      const dinerIds = Array.from(dinerMap.keys());
      const { data: profiles } = await supabase.from("diner_profiles").select("*").in("id", dinerIds);

      const result: DinerRow[] = (profiles || []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        phone: p.phone,
        allergens: p.allergens || [],
        visit_count: dinerMap.get(p.id)?.count || 0,
        last_visit: dinerMap.get(p.id)?.last || null,
      }));
      result.sort((a, b) => b.visit_count - a.visit_count);
      setDiners(result);
      setLoading(false);
    };
    fetchDiners();
  }, [scopeVenueIds.join(",")]);

  const filtered = diners.filter((d) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (d.display_name || "").toLowerCase().includes(s) || (d.email || "").toLowerCase().includes(s) || (d.phone || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Diners</h3>
        <p className="text-sm text-muted-foreground">
          {groupId ? "All diners across all venues in the parent company." : "Diners who have visited this venue."}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search diners..." className="pl-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-muted-foreground">No diners found.</p></CardContent></Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Last Visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.display_name || "Anonymous"}</TableCell>
                  <TableCell className="text-muted-foreground">{d.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{d.phone || "—"}</TableCell>
                  <TableCell>{d.visit_count}</TableCell>
                  <TableCell className="text-muted-foreground">{d.last_visit ? new Date(d.last_visit).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
