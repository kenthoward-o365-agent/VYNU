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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Paintbrush, Settings, Users, Plus, Eye, EyeOff } from "lucide-react";

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

  const isManager = venueRole === "owner" || venueRole === "manager" || isTablessAdmin;

  const [form, setForm] = useState({
    name: "", venue_type: "restaurant", address: "", city: "", state: "NSW",
    postcode: "", phone: "", email: "",
  });
  const [loading, setLoading] = useState(false);

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [newUserDialog, setNewUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", display_name: "", role: "staff" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    const { data } = await supabase.from("venue_staff").select("*").eq("venue_id", venue.id);
    setStaff((data || []) as StaffMember[]);
    setStaffLoading(false);
  };

  const save = async () => {
    if (!venue) return;
    setLoading(true);
    const { error } = await supabase.from("venues").update(form).eq("id", venue.id);
    if (error) { toast.error(error.message); } else { toast.success("Settings saved"); await refetch(); }
    setLoading(false);
  };

  const createUser = async () => {
    if (!venue || !newUser.email || !newUser.password) return;
    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newUser.email,
          password: newUser.password,
          venue_id: venue.id,
          role: newUser.role,
          display_name: newUser.display_name || null,
        },
      });
      if (error) {
        const msg = typeof error === "object" && "context" in error
          ? (await (error as any).context?.json?.())?.error || error.message
          : error.message;
        throw new Error(msg || "Failed to create user");
      }
      if (data?.error) throw new Error(data.error);
      toast.success(`${newUser.email} added as ${newUser.role}`);
      setNewUserDialog(false);
      setNewUser({ email: "", password: "", display_name: "", role: "staff" });
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message || "Error creating user");
    }
    setCreatingUser(false);
  };

  const toggleStaffActive = async (staffId: string, currentActive: boolean) => {
    const { error } = await supabase.from("venue_staff").update({ is_active: !currentActive }).eq("id", staffId);
    if (error) toast.error(error.message);
    else { toast.success(currentActive ? "Staff deactivated" : "Staff reactivated"); fetchStaff(); }
  };

  const updateStaffRole = async (staffId: string, newRole: string) => {
    const { error } = await supabase.from("venue_staff").update({ role: newRole }).eq("id", staffId);
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); fetchStaff(); }
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Venue Settings</h2>
        <p className="text-muted-foreground">Manage your venue details and team</p>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details"><Settings className="h-3.5 w-3.5 mr-1" />Details</TabsTrigger>
          {isManager && (
            <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />Users</TabsTrigger>
          )}
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
                <SelectContent>
                  {venueTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
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

          {/* Group Assignment */}
          <Card>
            <CardHeader>
              <CardTitle>Parent Company</CardTitle>
              <CardDescription>Group affiliation for this venue</CardDescription>
            </CardHeader>
            <CardContent>
              {venue?.group_id ? (
                <p className="text-sm text-foreground">This venue belongs to a parent company. Manage group settings from the <strong>Parent Company</strong> page.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Not assigned to any parent company. Visit the Parent Company page to create or join a group.</p>
              )}
            </CardContent>
          </Card>

          {/* Landing Page Builder */}
          <Card>
            <CardHeader>
              <CardTitle>Diner Landing Page</CardTitle>
              <CardDescription>Customise the page diners see when they scan your QR code</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/settings/landing-page")}>
                <Paintbrush className="h-4 w-4 mr-2" />
                Open Landing Page Editor
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USERS TAB (owners/managers only) ── */}
        {isManager && (
          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Staff & Users</h3>
                <p className="text-sm text-muted-foreground">Manage who has access to this venue. {staff.length} member{staff.length !== 1 ? "s" : ""}.</p>
              </div>
              <Dialog open={newUserDialog} onOpenChange={setNewUserDialog}>
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
                          {venueRole === "owner" || isTablessAdmin ? (
                            <>
                              <SelectItem value="owner">Owner</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </>
                          ) : (
                            <SelectItem value="staff">Staff</SelectItem>
                          )}
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

            {staffLoading ? (
              <p className="text-muted-foreground">Loading staff...</p>
            ) : staff.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No staff assigned to this venue yet.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {staff.map((s) => {
                  const isSelf = s.user_id === user?.id;
                  const canEditRole = (venueRole === "owner" || isTablessAdmin) && !isSelf;
                  return (
                    <Card key={s.id}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{s.display_name || "No name"}{isSelf && <span className="text-xs text-muted-foreground ml-2">(you)</span>}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.user_id.slice(0, 8)}...</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {canEditRole ? (
                            <Select value={s.role} onValueChange={(v) => updateStaffRole(s.id, v)}>
                              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="staff">Staff</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="capitalize">{s.role}</Badge>
                          )}
                          {!isSelf && isManager && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{s.is_active ? "Active" : "Inactive"}</span>
                              <Switch checked={s.is_active} onCheckedChange={() => toggleStaffActive(s.id, s.is_active)} />
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
