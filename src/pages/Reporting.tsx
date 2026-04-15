import { useEffect, useState } from "react";
import { useAuditDate } from "@/contexts/AuditDateContext";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarCheck, ChevronRight, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface DayEndLogEntry {
  id: string;
  audit_date: string;
  closed_at: string;
  closed_by: string | null;
}

export default function Reporting() {
  const { auditDate, advanceDay, loading: auditLoading } = useAuditDate();
  const { venue } = useVenue();
  const { toast } = useToast();
  const [log, setLog] = useState<DayEndLogEntry[]>([]);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (!venue) return;
    supabase
      .from("venue_dayend_log")
      .select("id, audit_date, closed_at, closed_by")
      .eq("venue_id", venue.id)
      .order("closed_at", { ascending: false })
      .limit(30)
      .then(({ data }) => { if (data) setLog(data); });
  }, [venue?.id, auditDate]);

  const handleAdvance = async () => {
    setAdvancing(true);
    const newDate = await advanceDay();
    setAdvancing(false);
    if (newDate) {
      toast({ title: "Day Closed", description: `Business day advanced to ${newDate}` });
    } else {
      toast({ title: "Error", description: "Failed to advance audit date", variant: "destructive" });
    }
  };

  if (auditLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">DayEnd & Reporting</h2>
        <p className="text-sm text-muted-foreground">{venue?.name}</p>
      </div>

      {/* Current Audit Date */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Current Business Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-foreground">
                {auditDate ? format(parseISO(auditDate), "EEEE, dd MMMM yyyy") : "—"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This is the active trading day. All orders and reports are recorded against this date.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" className="gap-2">
                  Close Day
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close Business Day?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close{" "}
                    <strong>{auditDate ? format(parseISO(auditDate), "dd MMM yyyy") : ""}</strong>{" "}
                    and advance the business day. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAdvance} disabled={advancing}>
                    {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirm Close Day
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Day-End History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Day-End History</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No day-end closings yet. Close your first business day above.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-muted-foreground border-b pb-2">
                <span>Business Day Closed</span>
                <span>Closed At</span>
              </div>
              {log.map((entry) => (
                <div key={entry.id} className="grid grid-cols-2 gap-4 text-sm py-1.5 border-b border-border/50">
                  <span className="text-foreground font-medium">
                    {format(parseISO(entry.audit_date), "dd MMM yyyy")}
                  </span>
                  <span className="text-muted-foreground">
                    {format(parseISO(entry.closed_at), "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reports placeholder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Reports will be available here soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
