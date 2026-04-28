import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Shield, Trash2, UserCog } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface AdminUser {
  role_id: string;
  user_id: string;
  email: string;
}

export default function AdminStaff() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const fetchAdmins = async () => {
    setLoading(true);
    // Get all tabless_admin roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role")
      .eq("role", "tabless_admin" as any);

    if (!roles || roles.length === 0) {
      setAdmins([]);
      setLoading(false);
      return;
    }

    // Fetch emails via edge function
    const userIds = roles.map((r) => r.user_id);
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;

    let emails: Record<string, string> = {};
    if (token) {
      try {
        const res = await supabase.functions.invoke("admin-create-user", {
          body: { action: "list_emails", user_ids: userIds, venue_id: "platform" },
        });
        emails = res.data?.emails || {};
      } catch {
        // fallback - no emails
      }
    }

    setAdmins(
      roles.map((r) => ({
        role_id: r.id,
        user_id: r.user_id,
        email: emails[r.user_id] || "Unknown",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const createAdmin = async () => {
    if (!form.email.trim() || !form.password.trim()) return;
    if (form.password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setCreating(true);

    try {
      // Use edge function to create user (or find existing) with service role
      const res = await supabase.functions.invoke("admin-create-user", {
        body: {
          action: "create_admin",
          email: form.email.trim(),
          password: form.password,
        },
      });

      if (res.error || res.data?.error) {
        toast({ title: "Error", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Admin user created" });
        setDialogOpen(false);
        setForm({ email: "", password: "" });
        fetchAdmins();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setCreating(false);
  };

  const removeAdmin = async (admin: AdminUser) => {
    try {
      const res = await supabase.functions.invoke("admin-create-user", {
        body: {
          action: "remove_admin",
          user_id: admin.user_id,
          role_id: admin.role_id,
        },
      });

      if (res.error || res.data?.error) {
        toast({ title: "Error", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Admin role removed" });
        fetchAdmins();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filtered = admins.filter(
    (a) => !search || a.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Platform Staff</h2>
          <p className="text-muted-foreground">Manage Shyndig admin accounts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Admin</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Platform Admin</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If the user already exists, their existing account will be granted admin access.
                </p>
              </div>
              <Button onClick={createAdmin} disabled={!form.email.trim() || !form.password.trim() || creating} className="w-full">
                {creating ? "Creating..." : "Add Admin"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email..." className="pl-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCog className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No admin users found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.role_id}>
                  <TableCell className="font-medium">{a.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      <Shield className="h-3 w-3 mr-1" /> Shyndig Admin
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.user_id !== user?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Admin Access</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the Shyndig admin role from {a.email}. They will retain any venue-level access.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeAdmin(a)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
