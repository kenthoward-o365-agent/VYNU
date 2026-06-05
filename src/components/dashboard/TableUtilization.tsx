import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { LayoutGrid } from "lucide-react";

interface Props {
  venueId: string;
  show: boolean;
}

export default function TableUtilization({ venueId, show }: Props) {
  const [total, setTotal] = useState(0);
  const [occupied, setOccupied] = useState(0);

  useEffect(() => {
    if (!show) return;
    const fetch = async () => {
      const { data: tables } = await supabase
        .from("tables")
        .select("id")
        .eq("venue_id", venueId);
      setTotal(tables?.length || 0);

      const { data: openSessions } = await supabase
        .from("table_sessions")
        .select("table_id")
        .eq("venue_id", venueId)
        .is("closed_at", null)
        .not("table_id", "is", null);

      const uniqueTables = new Set((openSessions || []).map((s) => s.table_id));
      setOccupied(uniqueTables.size);
    };
    fetch();
  }, [venueId, show]);

  if (!show) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Table Utilization</CardTitle>
        <LayoutGrid className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{occupied} / {total}</div>
        <p className="text-xs text-muted-foreground">tables occupied</p>
      </CardContent>
    </Card>
  );
}
