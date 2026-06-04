import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { FinancialsVenueRow } from "@/pages/AdminFinancials";
import { format } from "date-fns";

interface Props {
  venues: FinancialsVenueRow[];
  loading: boolean;
}

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (d: string | null) => d ? format(new Date(d), "dd MMM yy") : "—";

export default function VenueRevenueTable({ venues, loading }: Props) {
  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>;
  if (!venues.length) return <p className="text-sm text-muted-foreground py-6 text-center">No venues found.</p>;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Venue</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Contract</TableHead>
            <TableHead className="text-right">Comm %</TableHead>
            <TableHead className="text-right">Min Fee</TableHead>
            <TableHead className="text-right">Net Revenue</TableHead>
            <TableHead className="text-right">Commission</TableHead>
            <TableHead className="text-right">Min Fees Due</TableHead>
            <TableHead className="text-right">Total Billable</TableHead>
            <TableHead className="text-right">Est. GMV</TableHead>
            <TableHead className="text-right">QR %</TableHead>
            <TableHead className="text-right">Effective QR GMV</TableHead>
            <TableHead className="text-right">Forecast Comm.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {venues.map((v) => (
            <TableRow key={v.venue_id}>
              <TableCell className="font-medium">
                <Link to={`/admin/venues/${v.venue_id}`} className="hover:underline">{v.name}</Link>
                <p className="text-[10px] text-muted-foreground capitalize">{v.venue_type.replace("_", " ")}</p>
              </TableCell>
              <TableCell>
                <Badge variant={v.is_active === false ? "secondary" : "default"}>
                  {v.is_active === false ? "Inactive" : "Active"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {fmtDate(v.contract_start_date)} → {fmtDate(v.contract_end_date)}
                {v.contract_end_date && v.months_remaining !== null && (
                  <p className="text-[10px]">{v.months_remaining} mo left</p>
                )}
              </TableCell>
              <TableCell className="text-right">{Number(v.commission_percent).toFixed(2)}%</TableCell>
              <TableCell className="text-right">{fmt(v.min_monthly_fee)}</TableCell>
              <TableCell className="text-right">{fmt(v.net_revenue)}</TableCell>
              <TableCell className="text-right">{fmt(v.commission_earned)}</TableCell>
              <TableCell className="text-right">{fmt(v.min_fee_due)}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(v.total_billable)}</TableCell>
              <TableCell className="text-right text-muted-foreground">${Number(v.estimated_annual_gmv || 0).toLocaleString()}</TableCell>
              <TableCell className="text-right">{Number(v.qr_gmv_percent ?? 100).toFixed(0)}%</TableCell>
              <TableCell className="text-right text-muted-foreground">${(Number(v.estimated_annual_gmv || 0) * Number(v.qr_gmv_percent ?? 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(v.forecast_annual_commission)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
