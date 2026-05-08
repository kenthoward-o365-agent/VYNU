import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Receipt, Star, MapPin, Pencil, Check, X, LogOut, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const COMMON_ALLERGENS = [
  "Gluten", "Dairy", "Eggs", "Soy", "Peanuts", "Tree Nuts",
  "Fish", "Shellfish", "Sesame", "Sulphites",
];

interface DinerProfileProps {
  venueId: string;
  groupId: string | null;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  allergens: string[] | null;
  birthday: string | null;
  created_at?: string;
}

interface OrderHistory {
  id: string;
  total: number;
  status: string;
  created_at: string;
  venue_name?: string;
  isOpen?: boolean;
}

interface LoyaltyInfo {
  id: string;
  balance: number;
  tier: string | null;
  program_name: string;
  program_type: string;
  /** "group" when shared across sibling venues, "venue" when single-venue. */
  scope: "group" | "venue";
  /** Number of sibling venues this group program covers (only set when scope === "group"). */
  group_venue_count?: number;
}

interface LoyaltyVenue {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export default function DinerProfile({ venueId, groupId }: DinerProfileProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo[]>([]);
  const [venues, setVenues] = useState<LoyaltyVenue[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", phone: "", allergens: [] as string[], birthday: "" });
  const [saving, setSaving] = useState(false);
  const [visitCount, setVisitCount] = useState<number>(0);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const openOrders = orders.filter((order) => order.isOpen);
  const pastOrders = orders.filter((order) => !order.isOpen);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setIsSignedIn(false);
      setLoading(false);
      return;
    }
    setIsSignedIn(true);

    // Fetch profile
    const { data: prof } = await supabase
      .from("diner_profiles")
      .select("id, first_name, last_name, email, phone, display_name, allergens, birthday, created_at")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (prof) {
      setProfile(prof as any);
      setEditForm({
        first_name: prof.first_name || "",
        last_name: prof.last_name || "",
        phone: prof.phone || "",
        allergens: prof.allergens || [],
        birthday: (prof as any).birthday || "",
      });

      // Fetch total visit count across all venues
      const { count } = await supabase
        .from("diner_visits")
        .select("id", { count: "exact", head: true })
        .eq("diner_id", prof.id);
      setVisitCount(count || 0);

      // Fetch orders (last 20)
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, total, status, created_at, venue_id")
        .or(`customer_id.eq.${prof.id},customer_id.eq.${session.user.id}`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (orderData?.length) {
        const venueIds = [...new Set(orderData.map((o) => o.venue_id))];
        const { data: venueNames } = await supabase
          .from("venues")
          .select("id, name")
          .in("id", venueIds);
        const nameMap = new Map((venueNames || []).map((v) => [v.id, v.name]));
        setOrders(orderData.map((o) => ({
          id: o.id,
          total: Number(o.total) || 0,
          status: o.status,
          created_at: o.created_at,
          venue_name: nameMap.get(o.venue_id) || "Unknown",
          isOpen: ["received", "preparing", "ready"].includes(o.status),
        })));
      } else {
        setOrders([]);
      }

      // Fetch loyalty — auto-enroll into any active programs the diner isn't in yet
      const { data: balances } = await supabase
        .from("loyalty_balances")
        .select("id, balance, tier, program_id")
        .eq("diner_id", prof.id);

      const enrolledProgramIds = new Set((balances || []).map((b) => b.program_id));

      // Find all active programs this venue/group offers
      const { data: venuePrograms } = await supabase
        .from("loyalty_programs").select("id, name, program_type, venue_id, group_id, rules").eq("venue_id", venueId).eq("is_active", true);
      let groupPrograms: any[] = [];
      if (groupId) {
        const { data: gp } = await supabase
          .from("loyalty_programs").select("id, name, program_type, venue_id, group_id, rules").eq("group_id", groupId).eq("is_active", true);
        groupPrograms = gp || [];
      }
      const allPrograms = [...(venuePrograms || []), ...groupPrograms];
      const uniquePrograms = [...new Map(allPrograms.map((p: any) => [p.id, p])).values()];
      const loyaltyGroupIdsForCount = uniquePrograms.filter((p: any) => p.group_id).map((p: any) => p.group_id);

      // Auto-enroll into missing programs
      const missing = uniquePrograms.filter((p: any) => !enrolledProgramIds.has(p.id));
      if (missing.length > 0) {
        const newEnrollments = missing.map((p: any) => {
          const rules = p.rules && typeof p.rules === "object" ? p.rules : {};
          return { diner_id: prof.id, program_id: p.id, balance: (rules as any).signup_bonus || 0 };
        });
        await supabase.from("loyalty_balances").insert(newEnrollments);
        // Re-fetch balances after enrollment
        const { data: updatedBalances } = await supabase
          .from("loyalty_balances")
          .select("id, balance, tier, program_id")
          .eq("diner_id", prof.id);
        const progMap = new Map(uniquePrograms.map((p: any) => [p.id, p]));
        // Count sibling venues per group_id (for "Earn & spend at all N venues" subtitle)
        const groupVenueCounts = new Map<string, number>();
        if (loyaltyGroupIdsForCount.length > 0) {
          const { data: gVenues } = await supabase
            .from("venues")
            .select("id, group_id")
            .in("group_id", loyaltyGroupIdsForCount)
            .neq("venue_type", "parent")
            .eq("is_active", true);
          (gVenues || []).forEach((v: any) => {
            groupVenueCounts.set(v.group_id, (groupVenueCounts.get(v.group_id) || 0) + 1);
          });
        }
        setLoyalty((updatedBalances || []).map((b) => {
          const prog: any = progMap.get(b.program_id);
          const isGroup = !!prog?.group_id;
          return {
            id: b.id,
            balance: Number(b.balance),
            tier: b.tier,
            program_name: prog?.name || "Loyalty Program",
            program_type: prog?.program_type || "points",
            scope: isGroup ? "group" : "venue",
            group_venue_count: isGroup ? groupVenueCounts.get(prog.group_id) : undefined,
          };
        }));
      } else {
        const progMap = new Map(uniquePrograms.map((p: any) => [p.id, p]));
        const groupVenueCounts = new Map<string, number>();
        if (loyaltyGroupIdsForCount.length > 0) {
          const { data: gVenues } = await supabase
            .from("venues")
            .select("id, group_id")
            .in("group_id", loyaltyGroupIdsForCount)
            .neq("venue_type", "parent")
            .eq("is_active", true);
          (gVenues || []).forEach((v: any) => {
            groupVenueCounts.set(v.group_id, (groupVenueCounts.get(v.group_id) || 0) + 1);
          });
        }
        setLoyalty((balances || []).map((b) => {
          const prog: any = progMap.get(b.program_id);
          const isGroup = !!prog?.group_id;
          return {
            id: b.id,
            balance: Number(b.balance),
            tier: b.tier,
            program_name: prog?.name || "Loyalty Program",
            program_type: prog?.program_type || "points",
            scope: isGroup ? "group" : "venue",
            group_venue_count: isGroup ? groupVenueCounts.get(prog.group_id) : undefined,
          };
        }));
      }

      // Fetch venues attached to loyalty programs
      const loyaltyGroupIds = uniquePrograms.filter((p: any) => p.group_id).map((p: any) => p.group_id!);
      const loyaltyVenueIds = uniquePrograms.filter((p: any) => p.venue_id).map((p: any) => p.venue_id!);
      let allVenueIds = [...loyaltyVenueIds];
      if (loyaltyGroupIds.length) {
        const { data: groupVenues } = await supabase
          .from("venues").select("id").in("group_id", loyaltyGroupIds).neq("venue_type", "parent").eq("is_active", true);
        if (groupVenues) allVenueIds.push(...groupVenues.map((v) => v.id));
      }
      if (allVenueIds.length) {
        const uniqueIds = [...new Set(allVenueIds)];
        const { data: venueList } = await supabase
          .from("venues").select("id, name, city, state").in("id", uniqueIds).eq("is_active", true);
        setVenues(venueList || []);
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("diner_profiles")
      .update({
        first_name: editForm.first_name.trim() || null,
        last_name: editForm.last_name.trim() || null,
        phone: editForm.phone.trim() || null,
        display_name: `${editForm.first_name.trim()} ${editForm.last_name.trim()}`.trim() || null,
        allergens: editForm.allergens,
        birthday: editForm.birthday || null,
      } as any)
      .eq("id", profile.id);
    setSaving(false);
    if (error) { toast.error("Failed to update profile"); return; }
    toast.success("H&L OrderNOW ID updated");
    setEditing(false);
    fetchAll();
  };

  const toggleAllergen = (a: string) => {
    setEditForm((f) => ({
      ...f,
      allergens: f.allergens.includes(a) ? f.allergens.filter((x) => x !== a) : [...f.allergens, a],
    }));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setIsSignedIn(false);
    setOrders([]);
    setLoyalty([]);
    setVenues([]);
    toast.success("Signed out");
  };

  if (loading) {
    return (
      <div className="px-5 pt-8 pb-24">
        <p className="text-center text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!isSignedIn || !profile) {
    return (
      <div className="px-5 pt-8 pb-24 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Your Profile</h2>
          <p className="text-sm text-muted-foreground">
            Sign in to view your profile, order history, loyalty points, and more.
          </p>
        </div>
      </div>
    );
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      received: "Received", preparing: "Preparing", ready: "Ready",
      served: "Served", paid: "Paid", cancelled: "Cancelled",
    };
    return map[s] || s;
  };

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : null;

  return (
    <div className="px-5 pt-6 pb-24 space-y-5">
      {/* H&L OrderNOW ID Header Card */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
                Your H&L OrderNOW ID
              </span>
            </div>
            <div className="flex gap-1">
              {!editing && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSignOut}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-foreground truncate">
                {profile.display_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Diner"}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
            {memberSince && <span>Member since {memberSince}</span>}
            {memberSince && <span aria-hidden>·</span>}
            <span>{visitCount} {visitCount === 1 ? "visit" : "visits"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      {editing && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First Name</Label>
                <Input
                  value={editForm.first_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Last Name</Label>
                <Input
                  value={editForm.last_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                🎂 Birthday
              </Label>
              <Input
                type="date"
                value={editForm.birthday}
                onChange={(e) => setEditForm((f) => ({ ...f, birthday: e.target.value }))}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Used to send you a birthday treat from venues running H&L OrderNOW Loyalty.
              </p>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-warning" />
                Allergens to avoid
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">
                Used at every H&L OrderNOW venue to filter your menu automatically.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ALLERGENS.map((a) => {
                  const active = editForm.allergens.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAllergen(a)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        active
                          ? "bg-warning/15 text-warning border-warning/40"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loyalty */}
      {loyalty.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-primary" /> Memberships
            </h3>
            <div className="space-y-2">
              {loyalty.map((l) => (
                <Card key={l.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{l.program_name}</p>
                      {l.scope === "group" && l.group_venue_count && l.group_venue_count > 1 ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Earn &amp; spend at all {l.group_venue_count} venues in this group
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Earn &amp; spend at this venue
                        </p>
                      )}
                      {l.tier && <Badge variant="secondary" className="text-xs mt-1">{l.tier}</Badge>}
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <p className="text-lg font-bold text-primary">{l.balance}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.program_type === "stamps" ? "stamps" : "points"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Participating Venues */}
      {venues.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" /> Participating Venues
            </h3>
            <div className="space-y-2">
              {venues.map((v) => (
                <Card key={v.id}>
                  <CardContent className="py-3 px-4">
                    <p className="text-sm font-medium text-foreground">{v.name}</p>
                    {(v.city || v.state) && (
                      <p className="text-xs text-muted-foreground">{[v.city, v.state].filter(Boolean).join(", ")}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Order History */}
      <Separator />
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Receipt className="h-4 w-4 text-muted-foreground" /> Order History
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Open orders</p>
            {openOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open orders.</p>
            ) : (
              <div className="space-y-2">
                {openOrders.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{o.venue_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString()} · {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">${o.total.toFixed(2)}</p>
                          <Badge className="text-xs">{statusLabel(o.status)}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Past orders</p>
            {pastOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past orders yet.</p>
            ) : (
              <div className="space-y-2">
                {pastOrders.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{o.venue_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString()} · {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">${o.total.toFixed(2)}</p>
                          <Badge variant="outline" className="text-xs">{statusLabel(o.status)}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
