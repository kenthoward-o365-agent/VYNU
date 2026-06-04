import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Link2, CreditCard, Copy } from "lucide-react";
import PaymentMethodModal from "./PaymentMethodModal";

export default function ARVenuesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const { data: venues } = await supabase.from("venues").select("id, name, is_active").order("name");
    const { data: accts } = await supabase.from("venue_billing_accounts").select("venue_id, payment_method_type, default_payment_method_id, is_active");
    const { data: methods } = await supabase.from("venue_payment_methods").select("venue_id, type, brand, last4, bank_name, is_default, is_active").eq("is_active", true).eq("is_default", true);
    const { data: lastInvoices } = await supabase.from("venue_invoices").select("venue_id, total, status, due_date, paid_at").order("created_at", { ascending: false });

    const merged = (venues || []).map(v => {
      const acct = accts?.find(a => a.venue_id === v.id);
      const pm = methods?.find(m => m.venue_id === v.id);
      const last = lastInvoices?.find(i => i.venue_id === v.id);
      return { ...v, acct, pm, last };
    });
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const issueLink = async (venueId: string, venueName: string) => {
    const { data, error } = await supabase.functions.invoke("ar-issue-onboarding-link", {
      body: { venue_id: venueId, methods_allowed: ["card", "becs"], expires_days: 7 },
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    await navigator.clipboard.writeText(data.url);
    toast({ title: "Link copied", description: `Self-serve setup link for ${venueName} copied to clipboard (7-day expiry).` });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>Payment method</TableHead>
                  <TableHead>Last invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      {r.pm ? (
                        <span className="text-sm">
                          {r.pm.type === "card" ? `${r.pm.brand} •••• ${r.pm.last4}` :
                           r.pm.type === "becs" ? `BECS ${r.pm.bank_name || ""} •••• ${r.pm.last4}` :
                           r.pm.type === "ach" ? `ACH ${r.pm.bank_name || ""} •••• ${r.pm.last4}` :
                           "Manual"}
                        </span>
                      ) : (
                        <Badge variant="outline">Not set up</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.last ? <>${Number(r.last.total).toFixed(2)} <Badge variant="outline" className="text-xs ml-1">{r.last.status}</Badge></> : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.acct?.is_active ? "default" : "outline"}>
                        {r.acct?.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => issueLink(r.id, r.name)}>
                        <Link2 className="h-3.5 w-3.5 mr-1" /> Send setup link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedVenue(r)}>
                        <CreditCard className="h-3.5 w-3.5 mr-1" /> Add method
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedVenue && (
        <PaymentMethodModal
          venueId={selectedVenue.id}
          venueName={selectedVenue.name}
          onClose={() => { setSelectedVenue(null); load(); }}
        />
      )}
    </div>
  );
}
