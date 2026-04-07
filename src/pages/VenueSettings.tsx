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
import { toast } from "sonner";
import { Paintbrush, Settings, Users, Plus, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

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
  const { user } = useAuth();
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
    if (venue && isManager) fetchStaff();
  }, [venue, isManager]);

  const fetchStaff = async () => {
    if (!venue) return;
    setStaffLoading(true);
    const { data } = await supabase.from("venue_staff").select("*").eq("venue_id", venue.id).order("created_at");
    setStaff((data || []) as StaffMember[]);
    setStaffLoading(false);
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
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body });
    if (error) {
      const msg = typeof error === "object" && "context" in error
        ? (await (error as any).context?.json?.())?.error || error.message
        : error.message;
      throw new Error(msg || "Request failed");
    }
    if (data?.error) throw new Error(data.error);
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
                              <p className="text-xs text-muted-foreground font-mono">{s.user_id.slice(0, 12)}...</p>
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
      </Tabs>
    </div>
  );
}
