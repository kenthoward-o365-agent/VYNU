import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Paintbrush } from "lucide-react";

const venueTypes = [
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "pub", label: "Pub" },
  { value: "fast_casual", label: "Fast Casual" },
  { value: "fine_dining", label: "Fine Dining" },
  { value: "food_truck", label: "Food Truck" },
];

export default function VenueSettings() {
  const { venue, refetch } = useVenue();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", venue_type: "restaurant", address: "", city: "", state: "NSW",
    postcode: "", phone: "", email: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (venue) {
      setForm({
        name: venue.name, venue_type: venue.venue_type, address: venue.address || "",
        city: venue.city || "", state: venue.state || "NSW", postcode: venue.postcode || "",
        phone: venue.phone || "", email: venue.email || "",
      });
    }
  }, [venue]);

  const save = async () => {
    if (!venue) return;
    setLoading(true);
    const { error } = await supabase.from("venues").update(form).eq("id", venue.id);
    if (error) { toast.error(error.message); } else { toast.success("Settings saved"); await refetch(); }
    setLoading(false);
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Venue Settings</h2>
        <p className="text-muted-foreground">Manage your venue details</p>
      </div>
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
    </div>
  );
}
