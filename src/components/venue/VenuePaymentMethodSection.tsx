import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Link2, CreditCard, Loader2, Trash2 } from "lucide-react";
import PaymentMethodModal from "@/components/admin/ar/PaymentMethodModal";

export default function VenuePaymentMethodSection({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("venue_payment_methods")
      .select("*")
      .eq("venue_id", venueId)
      .eq("is_active", true)
      .order("is_default", { ascending: false });
    setMethods(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [venueId]);

  const issueLink = async () => {
    const { data, error } = await supabase.functions.invoke("ar-issue-onboarding-link", {
      body: { venue_id: venueId, methods_allowed: ["card", "becs"], expires_days: 7 },
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    await navigator.clipboard.writeText(data.url);
    toast({ title: "Self-serve link copied", description: "7-day expiry. Email or message it to the venue." });
  };

  const activeCount = methods.length;

  const detach = async (id: string) => {
    if (activeCount <= 1) {
      toast({
        title: "Add a replacement first",
        description: "At least one active payment method must remain on file. Add a new method, then remove this one.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm("Remove this payment method?")) return;
    const { data, error } = await supabase.functions.invoke("ar-detach-method", {
      body: { venue_id: venueId, payment_method_id: id },
    });
    if (error || (data as any)?.error) {
      toast({ title: "Failed", description: error?.message || (data as any)?.error, variant: "destructive" });
    } else { toast({ title: "Removed" }); load(); }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>H&L Pay — Payment method</CardTitle>
        <CardDescription>
          Securely collected via Stripe (PCI-DSS SAQ A). Card numbers never touch H&L Pay servers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="animate-spin h-5 w-5" />
        ) : methods.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
            No payment method on file. Send a self-serve setup link or add one directly.
          </div>
        ) : (
          <div className="space-y-2">
            {methods.map(m => (
              <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    {m.type === "card" ? `${m.brand?.toUpperCase()} •••• ${m.last4}` :
                     m.type === "becs" ? `BECS ${m.bank_name || ""} •••• ${m.last4}` :
                     m.type === "ach" ? `ACH ${m.bank_name || ""} •••• ${m.last4}` : "Manual"}
                    {m.is_default && <Badge variant="default" className="ml-2 text-xs">Default</Badge>}
                  </p>
                  {m.exp_month && (
                    <p className="text-xs text-muted-foreground">Expires {String(m.exp_month).padStart(2, "0")}/{m.exp_year}</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => detach(m.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowModal(true)}>
            <CreditCard className="h-3.5 w-3.5 mr-2" /> Add payment method
          </Button>
          <Button size="sm" variant="outline" onClick={issueLink}>
            <Link2 className="h-3.5 w-3.5 mr-2" /> Send self-serve link
          </Button>
        </div>
      </CardContent>

      {showModal && (
        <PaymentMethodModal
          venueId={venueId}
          venueName={venueName}
          onClose={() => { setShowModal(false); load(); }}
        />
      )}
    </Card>
  );
}
