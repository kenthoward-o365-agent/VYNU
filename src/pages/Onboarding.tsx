import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const venueTypes = [
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "pub", label: "Pub" },
  { value: "fast_casual", label: "Fast Casual" },
  { value: "fine_dining", label: "Fine Dining" },
  { value: "food_truck", label: "Food Truck" },
];

const states = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

export default function Onboarding() {
  const { user, signOut } = useAuth();
  const { refetch } = useVenue();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    venue_type: "restaurant",
    address: "",
    city: "",
    state: "NSW",
    postcode: "",
    phone: "",
    email: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_venue_with_owner", {
        _name: form.name,
        _venue_type: form.venue_type,
        _address: form.address || null,
        _city: form.city || null,
        _state: form.state,
        _postcode: form.postcode || null,
        _phone: form.phone || null,
        _email: form.email || null,
        _display_name: user.user_metadata?.display_name || user.email || null,
      });
      if (error) throw error;

      toast.success("Venue created! Let's set up your menu.");
      await refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Set up your venue</h1>
          <p className="text-muted-foreground">Tell us about your venue to get started</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Venue Details</CardTitle>
            <CardDescription>We'll use this to configure your Shyndig experience</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Venue name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
              <Select value={form.venue_type} onValueChange={(v) => update("venue_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {venueTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Street address" value={form.address} onChange={(e) => update("address", e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} />
                <Select value={form.state} onValueChange={(v) => update("state", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Postcode" value={form.postcode} onChange={(e) => update("postcode", e.target.value)} />
              </div>
              <Input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              <Input type="email" placeholder="Contact email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create Venue"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => signOut()}
              >
                Not a venue owner? Sign out
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
