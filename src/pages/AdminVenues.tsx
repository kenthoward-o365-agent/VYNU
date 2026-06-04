import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Building2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
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

interface BillingConfig {
  venue_id: string;
  commission_percent: number;
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
  { value: "bottle_shop", label: "Bottle Shop" },
];

const typeLabels: Record<string, string> = Object.fromEntries(venueTypes.map((t) => [t.value, t.label]));

const statusColors: Record<string, string> = {
  trial: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  active: "bg-green-500/10 text-green-600 border-green-500/30",
  suspended: "bg-destructive/10 text-destructive border-destructive/30",
};

const PAGE_SIZE = 25;

export default function AdminVenues() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [billingMap, setBillingMap] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<VenueGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, typeFilter]);

  const fetchGroups = async () => {
    const { data } = await supabase.from("venue_groups").select("id, name");
    setGroups((data || []) as VenueGroup[]);
  };

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("search_admin_venues", {
      _search: debouncedSearch || null,
      _status: statusFilter,
      _venue_type: typeFilter,
      _limit: PAGE_SIZE,
      _offset: (page - 1) * PAGE_SIZE,
    });
    if (!error && data) {
      const payload = data as unknown as { total: number; venues: (AdminVenue & { commission_percent: number | null })[] };
      setVenues(payload.venues as AdminVenue[]);
      setTotal(payload.total);
      const bMap: Record<string, number> = {};
      payload.venues.forEach((v) => {
        if (v.commission_percent != null) bMap[v.id] = Number(v.commission_percent);
      });
      setBillingMap(bMap);
    }
    setLoading(false);
  };

  useEffect(() => { fetchGroups(); }, []);
  useEffect(() => { fetchData(); }, [debouncedSearch, statusFilter, typeFilter, page]);

  const createVenue = async () => {
    if (!form.name.trim()) return;
    setCreating(true);

    let groupId = form.group_id === "__none__" ? null : form.group_id;

    if (form.venue_type === "parent") {
      const { data: newGroup, error: groupErr } = await supabase
        .from("venue_groups")
        .insert({ name: form.name.trim() })
        .select("id")
        .single();
      if (groupErr || !newGroup) {
        toast({ title: "Error creating parent group", description: groupErr?.message, variant: "destructive" });
        setCreating(false);
        return;
      }
      groupId = newGroup.id;
    }

    const insertData: any = {
      name: form.name.trim(),
      venue_type: form.venue_type,
      city: form.city || null,
      state: form.state || null,
      address: form.address || null,
      postcode: form.postcode || null,
      phone: form.phone || null,
      email: form.email || null,
      group_id: groupId,
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
      fetchGroups();
      fetchData();
    }
    setCreating(false);
  };

  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name])), [groups]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = venues;
  const filtered = venues;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Manage Venues</h2>
          <p className="text-muted-foreground">{total} venues</p>
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or city..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {venueTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Building2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-muted-foreground">No venues found.</p></CardContent></Card>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/venues/${v.id}`)}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-muted-foreground">{v.city || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.state || "—"}</TableCell>
                    <TableCell>{typeLabels[v.venue_type] || v.venue_type}</TableCell>
                    <TableCell>
                      {v.group_id ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {groupMap[v.group_id] || "Unknown"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[v.subscription_status || "trial"] || ""}>
                        {v.subscription_status || "trial"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{v.subscription_plan || "basic"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {billingMap[v.id] !== undefined ? `${billingMap[v.id]}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/admin/venues/${v.id}`); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
