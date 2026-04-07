import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Building2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AdminVenue {
  id: string;
  name: string;
  venue_type: string;
  city: string | null;
  state: string | null;
  is_active: boolean | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  group_id: string | null;
  created_at: string;
}

interface VenueGroup {
  id: string;
  name: string;
}

const venueTypes = [
  { value: "parent", label: "Parent Company" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "pub", label: "Pub" },
  { value: "fast_casual", label: "Fast Casual" },
  { value: "fine_dining", label: "Fine Dining" },
  { value: "food_truck", label: "Food Truck" },
];

const statusColors: Record<string, string> = {
  trial: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  active: "bg-green-500/10 text-green-600 border-green-500/30",
  suspended: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function AdminVenues() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [groups, setGroups] = useState<VenueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    venue_type: "restaurant",
    city: "",
    state: "NSW",
    address: "",
    postcode: "",
    phone: "",
    email: "",
    group_id: "__none__",
  });

  const fetchData = async () => {
    setLoading(true);
    const [{ data: venueData }, { data: groupData }] = await Promise.all([
      supabase.from("venues").select("id, name, venue_type, city, state, is_active, subscription_status, subscription_plan, group_id, created_at").order("created_at", { ascending: false }),
      supabase.from("venue_groups").select("id, name"),
    ]);
    setVenues((venueData || []) as AdminVenue[]);
    setGroups((groupData || []) as VenueGroup[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const createVenue = async () => {
    if (!form.name.trim()) return;
    setCreating(true);

    const insertData: any = {
      name: form.name.trim(),
      venue_type: form.venue_type,
      city: form.city || null,
      state: form.state || null,
      address: form.address || null,
      postcode: form.postcode || null,
      phone: form.phone || null,
      email: form.email || null,
      group_id: form.group_id === "__none__" ? null : form.group_id,
      subscription_status: "trial",
      subscription_plan: "basic",
    };

    const { error } = await supabase.from("venues").insert(insertData);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Venue created" });
      setDialogOpen(false);
      setForm({ name: "", venue_type: "restaurant", city: "", state: "NSW", address: "", postcode: "", phone: "", email: "", group_id: "__none__" });
      fetchData();
    }
    setCreating(false);
  };

  const filtered = venues.filter((v) => {
    const matchSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) || (v.city || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || v.subscription_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getGroupName = (gid: string | null) => groups.find((g) => g.id === gid)?.name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Manage Venues</h2>
          <p className="text-muted-foreground">{venues.length} total venues</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Create Venue</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create New Venue</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Venue Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. The Corner Café" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.venue_type} onValueChange={(v) => setForm({ ...form, venue_type: v, ...(v === "parent" ? { group_id: "__none__" } : {}) })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{venueTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
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
              </div>
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
              <Button onClick={createVenue} disabled={!form.name.trim() || creating} className="w-full">
                {creating ? "Creating..." : "Create Venue"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search venues..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Building2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-muted-foreground">No venues found.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <Card key={v.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/admin/venues/${v.id}`)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base truncate">{v.name}</CardTitle>
                <Badge variant="outline" className={statusColors[v.subscription_status || "trial"] || ""}>
                  {v.subscription_status || "trial"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{v.venue_type} · {v.city || "No city"}{v.state ? `, ${v.state}` : ""}</p>
                {v.group_id && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span>{getGroupName(v.group_id)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Plan: {v.subscription_plan || "basic"}</p>
                <div className="flex justify-end">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
