import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { FinancialsVenueRow } from "@/pages/AdminFinancials";
import { differenceInDays, format } from "date-fns";

interface Props { venues: FinancialsVenueRow[]; }

export default function ContractsOverview({ venues }: Props) {
  const now = new Date();
  const expiring = venues
    .filter((v) => v.contract_end_date && differenceInDays(new Date(v.contract_end_date), now) <= 90 && differenceInDays(new Date(v.contract_end_date), now) >= 0)
    .sort((a, b) => new Date(a.contract_end_date!).getTime() - new Date(b.contract_end_date!).getTime());

  const expired = venues.filter((v) => v.contract_end_date && new Date(v.contract_end_date) < now);
  const missing = venues.filter((v) => !v.contract_start_date || !v.contract_end_date);

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Renewals Due (next 90 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No contracts expiring soon.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Contract End</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Auto-Renew</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.map((v) => (
                    <TableRow key={v.venue_id}>
                      <TableCell><Link to={`/admin/venues/${v.venue_id}`} className="hover:underline font-medium">{v.name}</Link></TableCell>
                      <TableCell>{format(new Date(v.contract_end_date!), "dd MMM yyyy")}</TableCell>
                      <TableCell>{differenceInDays(new Date(v.contract_end_date!), now)}</TableCell>
                      <TableCell><Badge variant={v.auto_renew ? "default" : "secondary"}>{v.auto_renew ? "Yes" : "No"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {expired.length > 0 && (
        <Card className="shadow-sm border-destructive/30">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base text-destructive">Expired Contracts</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Ended</TableHead>
                    <TableHead>Auto-Renew</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expired.map((v) => (
                    <TableRow key={v.venue_id}>
                      <TableCell><Link to={`/admin/venues/${v.venue_id}`} className="hover:underline font-medium">{v.name}</Link></TableCell>
                      <TableCell>{format(new Date(v.contract_end_date!), "dd MMM yyyy")}</TableCell>
                      <TableCell><Badge variant={v.auto_renew ? "default" : "secondary"}>{v.auto_renew ? "Yes" : "No"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Missing Contract Dates</CardTitle>
          <p className="text-xs text-muted-foreground">Venues without complete contract start/end dates configured</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {missing.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">All venues have contract dates set.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missing.map((v) => (
                    <TableRow key={v.venue_id}>
                      <TableCell><Link to={`/admin/venues/${v.venue_id}`} className="hover:underline font-medium">{v.name}</Link></TableCell>
                      <TableCell className="text-muted-foreground">{v.contract_start_date || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{v.contract_end_date || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
