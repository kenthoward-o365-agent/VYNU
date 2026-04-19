import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { TOP_LEVEL_NAV } from "@/hooks/use-permissions";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  display_order: number;
}

interface PermissionsRow {
  role_id: string;
  nav_keys: string[];
  can_update_order_status: boolean;
  can_reopen_and_refund_orders: boolean;
  can_manage_roles: boolean;
  can_manage_settings: boolean;
}

interface RoleFormState {
  id?: string;
  name: string;
  description: string;
  navKeys: Set<string>;
  canUpdateOrderStatus: boolean;
  canReopenAndRefund: boolean;
  canManageRoles: boolean;
  canManageSettings: boolean;
}

const blankForm = (): RoleFormState => ({
  name: "",
  description: "",
  navKeys: new Set(["dashboard", "orders"]),
  canUpdateOrderStatus: true,
  canReopenAndRefund: false,
  canManageRoles: false,
  canManageSettings: false,
});

export default function RolesManager({ venueId }: { venueId: string }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [perms, setPerms] = useState<Record<string, PermissionsRow>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RoleFormState>(blankForm());
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data: roleRows } = await supabase
      .from("venue_roles")
      .select("*")
      .eq("venue_id", venueId)
      .order("display_order");
    const list = (roleRows || []) as RoleRow[];
    setRoles(list);

    const ids = list.map((r) => r.id);
    if (ids.length > 0) {
      const { data: permRows } = await supabase
        .from("venue_role_permissions")
        .select("*")
        .in("role_id", ids);
      const map: Record<string, PermissionsRow> = {};
      (permRows || []).forEach((p: any) => { map[p.role_id] = p; });
      setPerms(map);

      const { data: staffRows } = await supabase
        .from("venue_staff")
        .select("role_id")
        .eq("venue_id", venueId)
        .eq("is_active", true);
      const counts: Record<string, number> = {};
      (staffRows || []).forEach((s: any) => {
        if (s.role_id) counts[s.role_id] = (counts[s.role_id] || 0) + 1;
      });
      setMemberCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [venueId]);

  const openNew = () => { setForm(blankForm()); setDialogOpen(true); };

  const openEdit = (role: RoleRow) => {
    const p = perms[role.id];
    setForm({
      id: role.id,
      name: role.name,
      description: role.description || "",
      navKeys: new Set(p?.nav_keys || []),
      canUpdateOrderStatus: !!p?.can_update_order_status,
      canReopenAndRefund: !!p?.can_reopen_and_refund_orders,
      canManageRoles: !!p?.can_manage_roles,
      canManageSettings: !!p?.can_manage_settings,
    });
    setDialogOpen(true);
  };

  const toggleNavKey = (key: string, on: boolean) => {
    setForm((f) => {
      const next = new Set(f.navKeys);
      if (on) next.add(key); else next.delete(key);
      return { ...f, navKeys: next };
    });
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      let roleId = form.id;
      if (roleId) {
        const { error } = await supabase
          .from("venue_roles")
          .update({ name: form.name.trim(), description: form.description.trim() || null })
          .eq("id", roleId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("venue_roles")
          .insert({
            venue_id: venueId,
            name: form.name.trim(),
            description: form.description.trim() || null,
            is_system: false,
            display_order: roles.length,
          })
          .select("id")
          .single();
        if (error) throw error;
        roleId = data.id;
      }

      const permPayload = {
        role_id: roleId!,
        nav_keys: Array.from(form.navKeys),
        can_update_order_status: form.canUpdateOrderStatus,
        can_reopen_and_refund_orders: form.canReopenAndRefund,
        can_manage_roles: form.canManageRoles,
        can_manage_settings: form.canManageSettings,
      };
      const { error: permErr } = await supabase
        .from("venue_role_permissions")
        .upsert(permPayload, { onConflict: "role_id" });
      if (permErr) throw permErr;

      toast.success(form.id ? "Role updated" : "Role created");
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: RoleRow) => {
    if (memberCounts[role.id] > 0) { toast.error("Reassign users before deleting this role"); return; }
    const { error } = await supabase.from("venue_roles").delete().eq("id", role.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Role deleted");
    fetchAll();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Roles & Permissions</CardTitle>
          <CardDescription>Define custom roles, choose which sidebar areas they see, and grant order-management permissions.</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Role</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit Role" : "New Role"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bar Staff" className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this role can do" rows={2} className="mt-1" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Sidebar access</Label>
                <p className="text-xs text-muted-foreground">Sub-items (e.g. Modifiers under Menu Builder) follow the parent's setting.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-border p-3">
                  {TOP_LEVEL_NAV.map((nav) => (
                    <label key={nav.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.navKeys.has(nav.key)}
                        onCheckedChange={(v) => toggleNavKey(nav.key, !!v)}
                      />
                      <span>{nav.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Order management permissions</Label>
                <div className="rounded-md border border-border divide-y divide-border">
                  <PermRow
                    title="Update Order Status"
                    description="Move orders through the workflow (Received → Preparing → …)"
                    checked={form.canUpdateOrderStatus}
                    onChange={(v) => setForm({ ...form, canUpdateOrderStatus: v })}
                  />
                  <PermRow
                    title="Re-open & Refund Closed Orders"
                    description="Process refunds via OrdrPay and re-open paid/served/cancelled orders"
                    checked={form.canReopenAndRefund}
                    onChange={(v) => setForm({ ...form, canReopenAndRefund: v })}
                  />
                  <PermRow
                    title="Manage Roles & Permissions"
                    description="Create and edit roles for this venue"
                    checked={form.canManageRoles}
                    onChange={(v) => setForm({ ...form, canManageRoles: v })}
                  />
                  <PermRow
                    title="Manage Venue Settings"
                    description="Edit venue details, payments, taxes, integrations, etc."
                    checked={form.canManageSettings}
                    onChange={(v) => setForm({ ...form, canManageSettings: v })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Role"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading roles…</p>
        ) : (
          <div className="space-y-2">
            {roles.map((role) => {
              const p = perms[role.id];
              const count = memberCounts[role.id] || 0;
              return (
                <div key={role.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{role.name}</span>
                      {role.is_system && <Badge variant="secondary" className="text-xs">System</Badge>}
                      <Badge variant="outline" className="text-xs">{count} member{count === 1 ? "" : "s"}</Badge>
                    </div>
                    {role.description && <p className="text-xs text-muted-foreground mt-1">{role.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(p?.nav_keys || []).map((k) => {
                        const label = TOP_LEVEL_NAV.find((n) => n.key === k)?.label || k;
                        return <Badge key={k} variant="outline" className="text-[10px]">{label}</Badge>;
                      })}
                      {p?.can_update_order_status && <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30" variant="outline">Status</Badge>}
                      {p?.can_reopen_and_refund_orders && <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30" variant="outline">Refund</Badge>}
                      {p?.can_manage_settings && <Badge className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30" variant="outline">Settings</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(role)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!role.is_system && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete role?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{role.name}" will be removed. {count > 0 && <strong>Reassign its {count} member{count === 1 ? "" : "s"} first.</strong>}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRole(role)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PermRow({ title, description, checked, onChange }: {
  title: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
