import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Paintbrush, Settings, Users, Plus, Eye, EyeOff, Pencil, Trash2, Gift, Search, Mail, Phone, DollarSign, Sparkles, Cake, Star, Award, Settings2, CreditCard, Receipt, Bot, Plug } from "lucide-react";
import SippaAISettings from "@/components/venue/SippaAISettings";
import PaymentSettingsTab from "@/components/venue/PaymentSettingsTab";
import TaxSettingsTab from "@/components/venue/TaxSettingsTab";
import SurchargeSettingsTab from "@/components/venue/SurchargeSettingsTab";
import IntegrationsSettingsTab from "@/components/venue/IntegrationsSettingsTab";
import RolesManager from "@/components/venue/RolesManager";

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
  role_id: string | null;
  display_name: string | null;
  is_active: boolean;
}

interface VenueRoleOption {
  id: string;
  name: string;
  is_system: boolean;
}

export default function VenueSettings() {
  const { venue, venueRole, isTablessAdmin, refetch } = useVenue();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "details";

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
  const [venueRoles, setVenueRoles] = useState<VenueRoleOption[]>([]);

  // Create user dialog
  const [createDialog, setCreateDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", display_name: "", role_id: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit user dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", role_id: "" });
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

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} className="space-y-6">

        {/* ── DETAILS TAB ── */}
        <TabsContent value="details" className="space-y-6 max-w-2xl">
          {venue && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Site ID</p>
                    <p className="font-mono text-lg font-bold text-foreground">{(venue as any).site_id || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Staff use this to log in to your venue</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText((venue as any).site_id || ""); toast.success("Site ID copied"); }}>Copy</Button>
                </div>
                <Separator />
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
        {isManager && venue && (
          <TabsContent value="users" className="space-y-6">
            {/* Section A — Roles */}
            <RolesManager venueId={venue.id} />

            {/* Section B — Users */}
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
        {isManager && venue && (
          <TabsContent value="loyalty" className="space-y-6">
            <VenueLoyaltyTab venueId={venue?.id} groupId={venue?.group_id} />
          </TabsContent>
        )}


        {/* ── PAYMENTS TAB ── */}
        {isManager && venue && (
          <>
            <TabsContent value="sippa" className="space-y-6">
              <SippaAISettings venueId={venue.id} />
            </TabsContent>
            <TabsContent value="payments" className="space-y-6">
              <PaymentSettingsTab venueId={venue.id} />
            </TabsContent>
            <TabsContent value="taxes" className="space-y-6">
              <TaxSettingsTab venueId={venue.id} />
            </TabsContent>
            <TabsContent value="gratuities" className="space-y-6">
              <GratuitiesSettingsTab venueId={venue.id} />
            </TabsContent>
            <TabsContent value="surcharges" className="space-y-6">
              <SurchargeSettingsTab venueId={venue.id} />
            </TabsContent>
            <TabsContent value="integrations" className="space-y-6">
              <IntegrationsSettingsTab venueId={venue.id} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GRATUITIES TAB
   ═══════════════════════════════════════════ */
interface GratuityOption {
  label: string;
  percent: number;
}

interface GratuitiesConfig {
  enabled: boolean;
  prompt: string;
  declineLabel: string;
  options: GratuityOption[];
}

const defaultGratuities: GratuitiesConfig = {
  enabled: false,
  prompt: "Add a tip?",
  declineLabel: "No thanks",
  options: [
    { label: "Good", percent: 10 },
    { label: "Great", percent: 15 },
    { label: "Amazing", percent: 20 },
  ],
};

function GratuitiesSettingsTab({ venueId }: { venueId: string }) {
  const [config, setConfig] = useState<GratuitiesConfig>(defaultGratuities);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sampleTotal = 30.0;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("venues").select("settings").eq("id", venueId).single();
      const existing = (data?.settings as any)?.gratuities as GratuitiesConfig | undefined;
      if (existing) setConfig(existing);
      setLoaded(true);
    })();
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    const { data: current } = await supabase.from("venues").select("settings").eq("id", venueId).single();
    const merged = { ...((current?.settings as any) || {}), gratuities: config };
    const { error } = await supabase.from("venues").update({ settings: merged }).eq("id", venueId);
    if (error) toast.error(error.message);
    else toast.success("Gratuity settings saved");
    setSaving(false);
  };

  const updateOption = (index: number, field: keyof GratuityOption, value: string | number) => {
    setConfig((prev) => {
      const opts = [...prev.options];
      opts[index] = { ...opts[index], [field]: value };
      return { ...prev, options: opts };
    });
  };

  if (!loaded) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Gratuities
              </CardTitle>
              <CardDescription>Allow diners to add a tip during checkout. Configure three suggestion buttons with custom labels and percentages.</CardDescription>
            </div>
            <Switch checked={config.enabled} onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))} />
          </div>
        </CardHeader>
        {config.enabled && (
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Prompt Message</Label>
              <p className="text-xs text-muted-foreground">The heading shown to diners above the tip options during checkout.</p>
              <Input
                value={config.prompt}
                onChange={(e) => setConfig((c) => ({ ...c, prompt: e.target.value }))}
                placeholder="e.g. Add a tip?"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Decline Button Label</Label>
              <p className="text-xs text-muted-foreground">The text shown on the button diners use to skip tipping.</p>
              <Input
                value={config.declineLabel}
                onChange={(e) => setConfig((c) => ({ ...c, declineLabel: e.target.value }))}
                placeholder="e.g. No thanks"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-sm font-semibold">Suggestion Buttons</Label>
              <p className="text-xs text-muted-foreground">
                Configure the three tip options shown to diners. Each button displays your label and the calculated tip amount based on the order total.
              </p>
              {config.options.map((opt, i) => (
                <div key={i} className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Button Label</Label>
                    <Input
                      value={opt.label}
                      onChange={(e) => updateOption(i, "label", e.target.value)}
                      placeholder="e.g. Great"
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-muted-foreground">Percentage</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={opt.percent}
                        onChange={(e) => updateOption(i, "percent", Number(e.target.value))}
                        className="pr-7"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Live Preview */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Preview</Label>
              <p className="text-xs text-muted-foreground">
                How the gratuity prompt will appear to diners at checkout (based on a ${sampleTotal.toFixed(2)} order).
              </p>
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium text-center">Add a tip?</p>
                <div className="grid grid-cols-3 gap-2">
                  {config.options.map((opt, i) => (
                    <button
                      key={i}
                      className="rounded-xl border border-border bg-card p-3 text-center hover:border-primary transition-colors"
                    >
                      <span className="block text-sm font-semibold">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.percent}%</span>
                      <span className="block text-sm font-medium mt-1">${(sampleTotal * opt.percent / 100).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
                <button className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2 transition-colors">
                  No thanks
                </button>
              </div>
            </div>

            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Gratuity Settings"}
            </Button>
          </CardContent>
        )}
      </Card>
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
  const [groupPrograms, setGroupPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", program_type: "points" });
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [expandedGroupProgram, setExpandedGroupProgram] = useState<string | null>(null);

  const fetchPrograms = async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await supabase.from("loyalty_programs").select("*").eq("venue_id", venueId).order("created_at");
    setPrograms((data || []).map((d: any) => ({ ...d, rules: (d.rules && typeof d.rules === "object" ? d.rules : {}) as LoyaltyRules })));
    setLoading(false);
  };

  const fetchGroupPrograms = async () => {
    if (!groupId) return;
    const { data } = await supabase.from("loyalty_programs").select("*").eq("group_id", groupId).eq("is_active", true).order("created_at");
    setGroupPrograms((data || []).map((d: any) => ({ ...d, rules: (d.rules && typeof d.rules === "object" ? d.rules : {}) as LoyaltyRules })));
  };

  useEffect(() => { fetchPrograms(); fetchGroupPrograms(); }, [venueId, groupId]);

  const createProgram = async () => {
    if (!form.name.trim() || !venueId) return;
    const { error } = await supabase.from("loyalty_programs").insert({
      venue_id: venueId,
      name: form.name.trim(),
      program_type: form.program_type as any,
      rules: defaultRules as any,
    });
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

  const typeLabel = (t: string) => (t === "points" ? "Points" : t === "stamps" ? "Stamps" : "Tier");

  const expandedGp = groupPrograms.find((p) => p.id === expandedGroupProgram) ?? null;

  return (
    <div className="space-y-6">
      {/* ── Inherited Group Programs (read-only) ── */}
      {groupPrograms.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Inherited Group Programs</h3>
            <Badge variant="outline" className="text-xs">Read-only</Badge>
          </div>
          <p className="text-sm text-muted-foreground">These programs are managed at the parent company level and apply to all venues in the group.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupPrograms.map((gp) => (
              <Card
                key={gp.id}
                className={`cursor-pointer transition-all border-primary/20 bg-primary/5 ${expandedGroupProgram === gp.id ? "ring-2 ring-primary" : "hover:border-primary/40"}`}
                onClick={() => setExpandedGroupProgram(expandedGroupProgram === gp.id ? null : gp.id)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{gp.name}</CardTitle>
                  <Badge variant="default">Active</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">Type: {typeLabel(gp.program_type)}</p>
                  <p className="text-xs text-muted-foreground italic">Managed by parent group</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {expandedGp && (() => {
            const rules: LoyaltyRules = { ...defaultRules, ...expandedGp.rules };
            return (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="flex flex-row items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{expandedGp.name} — Rules</CardTitle>
                    <p className="text-sm text-muted-foreground">Read-only view of group-level settings</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                      <div className="flex items-center gap-1.5 text-sm font-medium"><DollarSign className="h-3.5 w-3.5 text-primary" />Earning Rate</div>
                      <p className="text-sm text-muted-foreground">{rules.points_per_dollar ?? 1} point(s) per $1 spent</p>
                    </div>
                    <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                      <div className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="h-3.5 w-3.5 text-primary" />Sign-up Bonus</div>
                      <p className="text-sm text-muted-foreground">{rules.signup_bonus ?? 0} points</p>
                    </div>
                    {rules.birthday_reward?.enabled && (
                      <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                        <div className="flex items-center gap-1.5 text-sm font-medium"><Cake className="h-3.5 w-3.5 text-primary" />Birthday Reward</div>
                        <p className="text-sm text-muted-foreground">{rules.birthday_reward.points} pts, {rules.birthday_reward.discount_percent}% off</p>
                      </div>
                    )}
                    {rules.anniversary_reward?.enabled && (
                      <div className="space-y-1 p-3 rounded-lg border border-border bg-background">
                        <div className="flex items-center gap-1.5 text-sm font-medium"><Star className="h-3.5 w-3.5 text-primary" />Anniversary Reward</div>
                        <p className="text-sm text-muted-foreground">{rules.anniversary_reward.points} pts, {rules.anniversary_reward.discount_percent}% off</p>
                      </div>
                    )}
                  </div>
                  {(rules.milestones || []).length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-sm font-medium"><Award className="h-3.5 w-3.5 text-primary" />Milestones</div>
                      {rules.milestones!.map((m, idx) => (
                        <div key={idx} className="text-sm text-muted-foreground p-2 rounded border border-border bg-background">
                          At {m.threshold} → {m.reward_type === "points" ? `${m.value} bonus pts` : m.reward_type === "discount" ? `${m.value}% off` : "Free item"} — {m.description}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Separator />
        </div>
      )}

      {/* ── Venue-level Programs (editable) ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Venue Programs</h3>
          <p className="text-sm text-muted-foreground">Loyalty programs specific to this venue.</p>
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
        <Card><CardContent className="py-12 text-center"><Gift className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-muted-foreground">No venue-specific loyalty programs yet.</p></CardContent></Card>
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
                  <p className="text-sm text-muted-foreground">Type: {typeLabel(p.program_type)}</p>
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

