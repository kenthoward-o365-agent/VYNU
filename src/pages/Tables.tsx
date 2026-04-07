import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, QrCode, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

interface Table {
  id: string;
  table_number: string;
  zone: string | null;
  capacity: number | null;
  qr_code: string | null;
  status: string | null;
}

export default function Tables() {
  const { venue } = useVenue();
  const [tables, setTables] = useState<Table[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogTable, setQrDialogTable] = useState<Table | null>(null);
  const [form, setForm] = useState({ table_number: "", zone: "", capacity: "4" });

  const fetchTables = async () => {
    if (!venue) return;
    const { data } = await supabase.from("tables").select("*").eq("venue_id", venue.id).order("table_number");
    setTables((data as Table[]) || []);
  };

  useEffect(() => { fetchTables(); }, [venue]);

  const addTable = async () => {
    if (!venue) return;
    const { data, error } = await supabase.from("tables").insert({
      venue_id: venue.id,
      table_number: form.table_number,
      zone: form.zone || null,
      capacity: parseInt(form.capacity) || 4,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    // Update qr_code with the generated table ID
    const qrUrl = `${window.location.origin}/order/${venue.id}/${data.id}`;
    await supabase.from("tables").update({ qr_code: qrUrl }).eq("id", data.id);
    toast.success("Table added");
    setDialogOpen(false);
    setForm({ table_number: "", zone: "", capacity: "4" });
    fetchTables();
  };

  const deleteTable = async (id: string) => {
    await supabase.from("tables").delete().eq("id", id);
    toast.success("Table removed");
    fetchTables();
  };

  const zones = [...new Set(tables.map((t) => t.zone).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tables & QR Codes</h2>
          <p className="text-muted-foreground">{tables.length} tables configured</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Add Table</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Table number (e.g. 1, A1)" value={form.table_number} onChange={(e) => setForm((f) => ({ ...f, table_number: e.target.value }))} />
              <Input placeholder="Zone (e.g. Patio, Main)" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
              <Input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
              <Button onClick={addTable} className="w-full" disabled={!form.table_number}>Add Table</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {tables.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No tables yet</h3>
            <p className="text-muted-foreground mb-4">Add tables to generate QR codes for your venue</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <Card key={table.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground text-lg">Table {table.table_number}</p>
                    <div className="flex gap-1.5">
                      {table.zone && <Badge variant="secondary" className="text-xs">{table.zone}</Badge>}
                      <Badge variant="outline" className="text-xs">{table.capacity} seats</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteTable(table.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {table.qr_code && (
                  <div
                    className="flex justify-center p-3 bg-card rounded-lg cursor-pointer border border-border hover:border-primary transition-colors"
                    onClick={() => setQrDialogTable(table)}
                  >
                    <QRCodeSVG value={table.qr_code} size={120} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* QR code zoom dialog */}
      <Dialog open={!!qrDialogTable} onOpenChange={() => setQrDialogTable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Table {qrDialogTable?.table_number} QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qrDialogTable?.qr_code && <QRCodeSVG value={qrDialogTable.qr_code} size={256} />}
            <p className="text-xs text-muted-foreground text-center break-all">{qrDialogTable?.qr_code}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
