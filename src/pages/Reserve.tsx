import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { useAuth } from "@/contexts/AuthContext";
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
import { toast } from "sonner";
import { Plus, Pencil, Phone, Mail, AlertTriangle } from "lucide-react";
import {
  BOOKING_STATUS_LABEL, BOOKING_TRANSITIONS, bookingConflicts, bookingSummary,
} from "@/lib/guest-suite";

interface Space {
  id: string;
  name: string;
  kind: string;
  capacity_min: number;
  capacity_max: number;
  is_active: boolean;
}

interface Booking {
  id: string;
  venue_id: string;
  space_id: string | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  party_size: number;
  starts_at: string;
  duration_minutes: number;
  status: string;
  source: string;
  occasion: string | null;
  notes: string | null;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  confirmed: "default",
  seated: "secondary",
  completed: "secondary",
  cancelled: "destructive",
  no_show: "destructive",
};

const todayLocalISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

type BookingForm = Partial<Booking> & { date?: string; time?: string };

export default function Reserve() {
  const { venue } = useVenue();
  const { user } = useAuth();
  const [date, setDate] = useState(todayLocalISO());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [editing, setEditing] = useState<BookingForm | null>(null);
  const [newSpace, setNewSpace] = useState({ name: "", capacity_max: 8 });

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    const [b, s] = await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("venue_id", venue.id)
        .gte("starts_at", dayStart.toISOString())
        .lt("starts_at", dayEnd.toISOString())
        .order("starts_at"),
      supabase
        .from("venue_spaces")
        .select("id, name, kind, capacity_min, capacity_max, is_active")
        .eq("venue_id", venue.id)
        .order("sort_order"),
    ]);
    if (b.error) toast.error("Failed to load bookings");
    else setBookings(b.data as Booking[]);
    if (!s.error) setSpaces(s.data as Space[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [venue?.id, date]);

  const diningSpaces = useMemo(
    () => spaces.filter((s) => s.is_active && s.kind === "dining"),
    [spaces],
  );

  const spaceName = (id: string | null) =>
    spaces.find((s) => s.id === id)?.name ?? null;

  const openNew = () => {
    setEditing({
      date,
      time: "18:00",
      party_size: 2,
      duration_minutes: 90,
      status: "confirmed",
      source: "staff",
      space_id: null,
    });
    setDialogOpen(true);
  };

  const openEdit = (b: Booking) => {
    const d = new Date(b.starts_at);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setEditing({
      ...b,
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
    });
    setDialogOpen(true);
  };

  const candidateWindow = editing?.date && editing?.time
    ? {
        id: editing.id,
        space_id: editing.space_id ?? null,
        starts_at: new Date(`${editing.date}T${editing.time}`).toISOString(),
        duration_minutes: editing.duration_minutes ?? 90,
        status: editing.status ?? "confirmed",
      }
    : null;
  const conflicts = candidateWindow ? bookingConflicts(bookings, candidateWindow) : [];

  const save = async () => {
    if (!editing || !venue) return;
    if (!editing.guest_name?.trim()) return toast.error("Guest name is required");
    if (!editing.date || !editing.time) return toast.error("Date and time are required");
    const payload = {
      venue_id: venue.id,
      space_id: editing.space_id || null,
      guest_name: editing.guest_name.trim(),
      guest_phone: editing.guest_phone?.trim() || null,
      guest_email: editing.guest_email?.trim() || null,
      party_size: editing.party_size ?? 2,
      starts_at: new Date(`${editing.date}T${editing.time}`).toISOString(),
      duration_minutes: editing.duration_minutes ?? 90,
      status: editing.status ?? "confirmed",
      source: editing.source ?? "staff",
      occasion: editing.occasion?.trim() || null,
      notes: editing.notes?.trim() || null,
    };
    if (editing.id) {
      const { error } = await supabase.from("bookings").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      await supabase.from("booking_events").insert({
        booking_id: editing.id, venue_id: venue.id, event: "updated", actor: user?.id ?? null,
      });
      toast.success("Booking updated");
    } else {
      const { data, error } = await supabase
        .from("bookings")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      await supabase.from("booking_events").insert({
        booking_id: data.id, venue_id: venue.id, event: "created", actor: user?.id ?? null,
        meta: { source: payload.source },
      });
      toast.success("Booking created");
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const transition = async (b: Booking, to: string) => {
    if (!venue) return;
    const { error } = await supabase.from("bookings").update({ status: to }).eq("id", b.id);
    if (error) return toast.error(error.message);
    await supabase.from("booking_events").insert({
      booking_id: b.id, venue_id: venue.id, event: `status:${to}`, actor: user?.id ?? null,
      meta: { from: b.status },
    });
    load();
  };

  const saveSpace = async () => {
    if (!venue || !newSpace.name.trim()) return;
    const { error } = await supabase.from("venue_spaces").insert({
      venue_id: venue.id,
      name: newSpace.name.trim(),
      kind: "dining",
      capacity_max: newSpace.capacity_max,
      sort_order: spaces.length,
    });
    if (error) return toast.error(error.message);
    setNewSpace({ name: "", capacity_max: 8 });
    load();
  };

  const toggleSpace = async (s: Space) => {
    const { error } = await supabase
      .from("venue_spaces")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  const active = bookings.filter((b) => !["cancelled", "no_show"].includes(b.status));
  const covers = active.reduce((n, b) => n + b.party_size, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reserve</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Table reservations — every booking lands on the guest record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSpacesOpen(true)}>
            Spaces
          </Button>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Booking
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-44"
          aria-label="Bookings date"
        />
        <span className="text-sm text-muted-foreground">
          {active.length} {active.length === 1 ? "booking" : "bookings"} · {covers} covers
        </span>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : bookings.length === 0 ? (
          <div className="p-6 text-muted-foreground">
            No bookings for this day. Click "New Booking" to add one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{b.guest_name}</span>
                    <Badge variant={STATUS_BADGE[b.status] ?? "outline"} className="text-xs">
                      {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                    </Badge>
                    {spaceName(b.space_id) && (
                      <Badge variant="outline" className="text-xs">{spaceName(b.space_id)}</Badge>
                    )}
                    {b.source !== "staff" && (
                      <Badge variant="secondary" className="text-xs capitalize">{b.source}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {bookingSummary(b.starts_at, b.party_size, b.duration_minutes)}
                    {b.occasion ? ` · ${b.occasion}` : ""}
                  </p>
                  {(b.guest_phone || b.guest_email) && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                      {b.guest_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />{b.guest_phone}
                        </span>
                      )}
                      {b.guest_email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />{b.guest_email}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {BOOKING_TRANSITIONS[b.status]?.map((to) => (
                  <Button
                    key={to}
                    variant={to === "cancelled" || to === "no_show" ? "ghost" : "outline"}
                    size="sm"
                    onClick={() => transition(b, to)}
                  >
                    {BOOKING_STATUS_LABEL[to]}
                  </Button>
                ))}
                <Button variant="ghost" size="icon" onClick={() => openEdit(b)} aria-label="Edit booking">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Booking dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Booking" : "New Booking"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="guest_name">Guest name *</Label>
                  <Input
                    id="guest_name"
                    value={editing.guest_name || ""}
                    onChange={(e) => setEditing({ ...editing, guest_name: e.target.value })}
                    placeholder="e.g. Mia Tran"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="guest_phone">Phone</Label>
                  <Input
                    id="guest_phone"
                    value={editing.guest_phone || ""}
                    onChange={(e) => setEditing({ ...editing, guest_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="guest_email">Email</Label>
                  <Input
                    id="guest_email"
                    value={editing.guest_email || ""}
                    onChange={(e) => setEditing({ ...editing, guest_email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bdate">Date *</Label>
                  <Input
                    id="bdate"
                    type="date"
                    value={editing.date || ""}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="btime">Time *</Label>
                  <Input
                    id="btime"
                    type="time"
                    value={editing.time || ""}
                    onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="party">Party size</Label>
                  <Input
                    id="party"
                    type="number"
                    min={1}
                    value={editing.party_size ?? 2}
                    onChange={(e) => setEditing({ ...editing, party_size: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="duration">Duration (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={15}
                    step={15}
                    value={editing.duration_minutes ?? 90}
                    onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Space</Label>
                  <Select
                    value={editing.space_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, space_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any</SelectItem>
                      {diningSpaces.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} (up to {s.capacity_max})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="occasion">Occasion</Label>
                  <Input
                    id="occasion"
                    value={editing.occasion || ""}
                    onChange={(e) => setEditing({ ...editing, occasion: e.target.value })}
                    placeholder="Birthday, anniversary…"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Allergies, seating preferences…"
                />
              </div>
              {conflicts.length > 0 && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Overlaps {conflicts.length} other {conflicts.length === 1 ? "booking" : "bookings"} in
                  this space at that time.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spaces dialog */}
      <Dialog open={spacesOpen} onOpenChange={setSpacesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dining spaces</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {spaces.filter((s) => s.kind === "dining").map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <span className={s.is_active ? "" : "text-muted-foreground line-through"}>
                  {s.name} <span className="text-xs text-muted-foreground">up to {s.capacity_max}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => toggleSpace(s)}>
                  {s.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ))}
            <div className="flex items-end gap-2 pt-2 border-t border-border">
              <div className="flex-1 space-y-1">
                <Label htmlFor="space_name">New space</Label>
                <Input
                  id="space_name"
                  value={newSpace.name}
                  onChange={(e) => setNewSpace({ ...newSpace, name: e.target.value })}
                  placeholder="e.g. Front Bar"
                />
              </div>
              <div className="w-24 space-y-1">
                <Label htmlFor="space_cap">Capacity</Label>
                <Input
                  id="space_cap"
                  type="number"
                  min={1}
                  value={newSpace.capacity_max}
                  onChange={(e) => setNewSpace({ ...newSpace, capacity_max: Number(e.target.value) })}
                />
              </div>
              <Button onClick={saveSpace}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
