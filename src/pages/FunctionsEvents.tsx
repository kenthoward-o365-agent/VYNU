import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Phone, Mail } from "lucide-react";
import { ENQUIRY_STATUSES } from "@/lib/guest-suite";

interface Enquiry {
  id: string;
  venue_id: string;
  space_id: string | null;
  package_id: string | null;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  event_type: string | null;
  event_date: string | null;
  party_size: number | null;
  budget_cents: number | null;
  status: string;
  source: string;
  notes: string | null;
}

interface Pkg {
  id: string;
  name: string;
  description: string | null;
  price_per_head_cents: number | null;
  min_guests: number;
  is_active: boolean;
}

interface Space {
  id: string;
  name: string;
  kind: string;
  is_active: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  confirmed: "Confirmed",
  lost: "Lost",
  completed: "Completed",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  contacted: "outline",
  quoted: "outline",
  confirmed: "secondary",
  lost: "destructive",
  completed: "secondary",
};

const dollars = (cents: number | null) =>
  cents == null ? null : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export default function FunctionsEvents() {
  const { venue } = useVenue();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Enquiry> | null>(null);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Partial<Pkg> | null>(null);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const [e, p, s] = await Promise.all([
      supabase
        .from("function_enquiries")
        .select("*")
        .eq("venue_id", venue.id)
        .order("event_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("function_packages")
        .select("id, name, description, price_per_head_cents, min_guests, is_active")
        .eq("venue_id", venue.id)
        .order("sort_order"),
      supabase
        .from("venue_spaces")
        .select("id, name, kind, is_active")
        .eq("venue_id", venue.id)
        .order("sort_order"),
    ]);
    if (e.error) toast.error("Failed to load enquiries");
    else setEnquiries(e.data as Enquiry[]);
    if (!p.error) setPackages(p.data as Pkg[]);
    if (!s.error) setSpaces(s.data as Space[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [venue?.id]);

  const visible = useMemo(() => {
    if (filter === "open")
      return enquiries.filter((e) => !["lost", "completed"].includes(e.status));
    if (filter === "all") return enquiries;
    return enquiries.filter((e) => e.status === filter);
  }, [enquiries, filter]);

  const spaceName = (id: string | null) => spaces.find((s) => s.id === id)?.name ?? null;
  const pkgName = (id: string | null) => packages.find((p) => p.id === id)?.name ?? null;

  const openNew = () => {
    setEditing({ status: "new", source: "staff", space_id: null, package_id: null });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing || !venue) return;
    if (!editing.contact_name?.trim()) return toast.error("Contact name is required");
    const payload = {
      venue_id: venue.id,
      space_id: editing.space_id || null,
      package_id: editing.package_id || null,
      contact_name: editing.contact_name.trim(),
      contact_phone: editing.contact_phone?.trim() || null,
      contact_email: editing.contact_email?.trim() || null,
      event_type: editing.event_type?.trim() || null,
      event_date: editing.event_date || null,
      party_size: editing.party_size ?? null,
      budget_cents: editing.budget_cents ?? null,
      status: editing.status ?? "new",
      source: editing.source ?? "staff",
      notes: editing.notes?.trim() || null,
    };
    if (editing.id) {
      const { error } = await supabase.from("function_enquiries").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Enquiry updated");
    } else {
      const { error } = await supabase.from("function_enquiries").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Enquiry created");
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const savePkg = async () => {
    if (!editingPkg || !venue) return;
    if (!editingPkg.name?.trim()) return toast.error("Package name is required");
    const payload = {
      venue_id: venue.id,
      name: editingPkg.name.trim(),
      description: editingPkg.description?.trim() || null,
      price_per_head_cents: editingPkg.price_per_head_cents ?? null,
      min_guests: editingPkg.min_guests ?? 10,
      is_active: editingPkg.is_active ?? true,
    };
    if (editingPkg.id) {
      const { error } = await supabase.from("function_packages").update(payload).eq("id", editingPkg.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("function_packages")
        .insert({ ...payload, sort_order: packages.length });
      if (error) return toast.error(error.message);
    }
    setEditingPkg(null);
    load();
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Functions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Event and space enquiries, from first call to confirmed function.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPkgOpen(true)}>
            Packages
          </Button>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Enquiry
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="open">Open</TabsTrigger>
          {ENQUIRY_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>{STATUS_LABEL[s]}</TabsTrigger>
          ))}
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-muted-foreground">No enquiries here yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{e.contact_name}</span>
                    <Badge variant={STATUS_BADGE[e.status] ?? "outline"} className="text-xs">
                      {STATUS_LABEL[e.status] ?? e.status}
                    </Badge>
                    {e.event_type && <Badge variant="outline" className="text-xs">{e.event_type}</Badge>}
                    {spaceName(e.space_id) && (
                      <Badge variant="secondary" className="text-xs">{spaceName(e.space_id)}</Badge>
                    )}
                    {pkgName(e.package_id) && (
                      <Badge variant="secondary" className="text-xs">{pkgName(e.package_id)}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {e.event_date
                      ? new Date(`${e.event_date}T00:00:00`).toLocaleDateString("en-AU", {
                          weekday: "short", day: "numeric", month: "short",
                        })
                      : "Date TBC"}
                    {e.party_size ? ` · ${e.party_size} guests` : ""}
                    {e.budget_cents != null ? ` · ~${dollars(e.budget_cents)}` : ""}
                  </p>
                  {(e.contact_phone || e.contact_email) && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                      {e.contact_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />{e.contact_phone}
                        </span>
                      )}
                      {e.contact_email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />{e.contact_email}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <Select value={e.status} onValueChange={async (v) => {
                  const { error } = await supabase
                    .from("function_enquiries").update({ status: v }).eq("id", e.id);
                  if (error) toast.error(error.message);
                  else load();
                }}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENQUIRY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon" aria-label="Edit enquiry"
                  onClick={() => { setEditing({ ...e }); setDialogOpen(true); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Enquiry dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Enquiry" : "New Enquiry"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="contact_name">Contact name *</Label>
                  <Input
                    id="contact_name"
                    value={editing.contact_name || ""}
                    onChange={(ev) => setEditing({ ...editing, contact_name: ev.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="contact_phone">Phone</Label>
                  <Input
                    id="contact_phone"
                    value={editing.contact_phone || ""}
                    onChange={(ev) => setEditing({ ...editing, contact_phone: ev.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="contact_email">Email</Label>
                  <Input
                    id="contact_email"
                    value={editing.contact_email || ""}
                    onChange={(ev) => setEditing({ ...editing, contact_email: ev.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="event_type">Event type</Label>
                  <Input
                    id="event_type"
                    value={editing.event_type || ""}
                    onChange={(ev) => setEditing({ ...editing, event_type: ev.target.value })}
                    placeholder="Birthday, corporate…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="event_date">Event date</Label>
                  <Input
                    id="event_date"
                    type="date"
                    value={editing.event_date || ""}
                    onChange={(ev) => setEditing({ ...editing, event_date: ev.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fparty">Guests</Label>
                  <Input
                    id="fparty"
                    type="number"
                    min={1}
                    value={editing.party_size ?? ""}
                    onChange={(ev) =>
                      setEditing({
                        ...editing,
                        party_size: ev.target.value ? Number(ev.target.value) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="budget">Budget ($)</Label>
                  <Input
                    id="budget"
                    type="number"
                    min={0}
                    value={editing.budget_cents != null ? editing.budget_cents / 100 : ""}
                    onChange={(ev) =>
                      setEditing({
                        ...editing,
                        budget_cents: ev.target.value ? Math.round(Number(ev.target.value) * 100) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Space</Label>
                  <Select
                    value={editing.space_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, space_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="TBC" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">TBC</SelectItem>
                      {spaces.filter((s) => s.is_active).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Package</Label>
                  <Select
                    value={editing.package_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, package_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {packages.filter((p) => p.is_active).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fnotes">Notes</Label>
                <Textarea
                  id="fnotes"
                  rows={2}
                  value={editing.notes || ""}
                  onChange={(ev) => setEditing({ ...editing, notes: ev.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packages dialog */}
      <Dialog open={pkgOpen} onOpenChange={(v) => { setPkgOpen(v); if (!v) setEditingPkg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Function packages</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {packages.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className={p.is_active ? "" : "text-muted-foreground line-through"}>
                    {p.name}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {dollars(p.price_per_head_cents) ? `${dollars(p.price_per_head_cents)}/head · ` : ""}
                    min {p.min_guests}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingPkg({ ...p })}>
                  Edit
                </Button>
              </div>
            ))}
            {packages.length === 0 && !editingPkg && (
              <p className="text-sm text-muted-foreground">No packages yet.</p>
            )}
            {editingPkg ? (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="space-y-1">
                  <Label htmlFor="pkg_name">Name *</Label>
                  <Input
                    id="pkg_name"
                    value={editingPkg.name || ""}
                    onChange={(ev) => setEditingPkg({ ...editingPkg, name: ev.target.value })}
                    placeholder="e.g. Canapés & Cocktails"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pkg_desc">Description</Label>
                  <Textarea
                    id="pkg_desc"
                    rows={2}
                    value={editingPkg.description || ""}
                    onChange={(ev) => setEditingPkg({ ...editingPkg, description: ev.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pkg_price">Per head ($)</Label>
                    <Input
                      id="pkg_price"
                      type="number"
                      min={0}
                      value={editingPkg.price_per_head_cents != null ? editingPkg.price_per_head_cents / 100 : ""}
                      onChange={(ev) =>
                        setEditingPkg({
                          ...editingPkg,
                          price_per_head_cents: ev.target.value
                            ? Math.round(Number(ev.target.value) * 100)
                            : null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pkg_min">Min guests</Label>
                    <Input
                      id="pkg_min"
                      type="number"
                      min={1}
                      value={editingPkg.min_guests ?? 10}
                      onChange={(ev) => setEditingPkg({ ...editingPkg, min_guests: Number(ev.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingPkg(null)}>Cancel</Button>
                  <Button size="sm" onClick={savePkg}>Save package</Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingPkg({ min_guests: 10, is_active: true })}
              >
                <Plus className="h-4 w-4 mr-2" />
                New package
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
