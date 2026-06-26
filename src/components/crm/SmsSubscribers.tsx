import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, Search, Trash2, Download, BellOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Subscriber {
  id: string;
  phone: string;
  marketing_opt_in: boolean;
  source: string;
  first_seen_at: string;
  opted_in_at: string | null;
  unsubscribed_at: string | null;
  receipt_send_count: number;
  last_receipt_sent_at: string | null;
}

export default function SmsSubscribers() {
  const { venue } = useVenue();
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sms_subscribers")
      .select("*")
      .eq("venue_id", venue.id)
      .order("first_seen_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load subscribers", description: error.message, variant: "destructive" });
    }
    setRows((data as Subscriber[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [venue?.id]);

  const filtered = rows.filter((r) => !search || r.phone.includes(search));
  const optedIn = rows.filter((r) => r.marketing_opt_in && !r.unsubscribed_at);

  const unsubscribe = async (id: string) => {
    const { error } = await (supabase as any)
      .from("sms_subscribers")
      .update({ marketing_opt_in: false, unsubscribed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Marked as unsubscribed" }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this subscriber permanently?")) return;
    const { error } = await (supabase as any).from("sms_subscribers").delete().eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); load(); }
  };

  const exportCsv = () => {
    const header = "phone,marketing_opt_in,source,first_seen_at,opted_in_at,unsubscribed_at,receipt_send_count\n";
    const body = optedIn.map((r) =>
      [r.phone, r.marketing_opt_in, r.source, r.first_seen_at, r.opted_in_at || "", r.unsubscribed_at || "", r.receipt_send_count].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sms-subscribers-${venue?.name || "venue"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Total captured</p>
          <p className="text-2xl font-bold">{rows.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Marketing opt-in</p>
          <p className="text-2xl font-bold text-primary">{optedIn.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Receipts texted</p>
          <p className="text-2xl font-bold">{rows.reduce((s, r) => s + (r.receipt_send_count || 0), 0)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />SMS Subscribers</CardTitle>
            <CardDescription>Phone numbers captured at receipt time. Stored separately from frequent diners.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phone" className="pl-7 h-9 w-44" />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!optedIn.length} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export opted-in
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No SMS subscribers yet. Diners can opt in when texting themselves a receipt.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead className="text-right">Receipts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                    <TableCell>
                      {r.unsubscribed_at ? (
                        <Badge variant="outline">Unsubscribed</Badge>
                      ) : r.marketing_opt_in ? (
                        <Badge>Opted in</Badge>
                      ) : (
                        <Badge variant="secondary">Receipt only</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{r.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.first_seen_at).toLocaleDateString("en-AU")}
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.receipt_send_count}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.marketing_opt_in && !r.unsubscribed_at && (
                          <Button variant="ghost" size="sm" onClick={() => unsubscribe(r.id)} title="Unsubscribe">
                            <BellOff className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => remove(r.id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
