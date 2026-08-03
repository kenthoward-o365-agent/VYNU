import { useCallback, useEffect, useState, useRef } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, QrCode, Trash2, Download, Printer, Smartphone, ExternalLink, X } from "lucide-react";
import MobilePreviewFrame from "@/components/landing-editor/MobilePreviewFrame";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
// Canonical public host baked into PRINTED QR stickers. It must stay stable across
// deploys/previews so physical stickers never break — so it is NOT derived from the
// current origin. Configurable via VITE_PUBLIC_APP_URL, defaulting to the production
// host. (Operator-facing preview/open links use the current origin instead — see
// getPreviewUrl below — so testing from a preview build opens the preview app.)
// Staging sets VITE_PUBLIC_APP_URL to its own host so QR stickers already printed
// against the staging app keep resolving.
const CANONICAL_QR_BASE_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL || "https://hlordernow.lovable.app";

interface Table {
  id: string;
  table_number: string;
  zone: string | null;
  zone_id: string | null;
  capacity: number | null;
  qr_code: string | null;
  status: string | null;
}

interface Zone {
  id: string;
  name: string;
  color: string;
}

const NO_ZONE = "__none__";

type TableInsert = Database["public"]["Tables"]["tables"]["Insert"];

export default function Tables() {
  const { venue } = useVenue();
  const [tables, setTables] = useState<Table[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogTable, setQrDialogTable] = useState<Table | null>(null);
  const [previewTable, setPreviewTable] = useState<Table | null>(null);
  const [form, setForm] = useState({ table_number: "", zone_id: NO_ZONE, capacity: "4", pos_table_id: "" });
  const printRef = useRef<HTMLDivElement>(null);

  // Operator-facing preview / "open live page" link. Built from the CURRENT origin
  // (window.location.origin) rather than the canonical sticker host, so previewing
  // from the Lovable preview build opens the preview app (with unpublished changes)
  // instead of always jumping to production. The printed sticker (table.qr_code)
  // is unaffected — it keeps the canonical host.
  const getPreviewUrl = (table: Table) => {
    if (!venue) return "";
    return `${window.location.origin}/order/${venue.id}/${table.id}`;
  };

  const fetchTables = useCallback(async () => {
    if (!venue) return;
    const [{ data }, { data: zoneRows }] = await Promise.all([
      supabase.from("tables").select("*").eq("venue_id", venue.id).order("table_number"),
      supabase.from("venue_zones").select("id, name, color").eq("venue_id", venue.id).eq("is_active", true).order("display_order"),
    ]);
    setTables((data as Table[]) || []);
    setZones(((zoneRows as any[]) || []) as Zone[]);
  }, [venue]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const addTable = async () => {
    if (!venue) return;
    const newTable: TableInsert = {
      venue_id: venue.id,
      table_number: form.table_number,
      zone_id: form.zone_id === NO_ZONE ? null : form.zone_id,
      capacity: parseInt(form.capacity) || 4,
      pos_table_id: form.pos_table_id || null,
    };
    const { data, error } = await supabase.from("tables").insert(newTable).select().single();
    if (error) { toast.error(error.message); return; }
    const qrUrl = `${CANONICAL_QR_BASE_URL}/order/${venue.id}/${data.id}`;
    await supabase.from("tables").update({ qr_code: qrUrl }).eq("id", data.id);
    toast.success("Table added");
    setDialogOpen(false);
    setForm({ table_number: "", zone_id: NO_ZONE, capacity: "4", pos_table_id: "" });
    fetchTables();
  };

  const deleteTable = async (id: string) => {
    await supabase.from("tables").delete().eq("id", id);
    toast.success("Table removed");
    fetchTables();
  };

  const downloadQr = (table: Table) => {
    const svg = document.querySelector(`#qr-${table.id} svg`) as SVGElement;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${table.table_number}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printQr = (table: Table) => {
    const svg = document.querySelector(`#qr-zoom svg`) as SVGElement;
    if (!svg) return;
    const win = window.open("", "_blank");
    if (!win) return;

    // HLRDRNW-68 · IVA-06 — build the print popup via DOM APIs so venue-controlled
    // strings (table number, venue name) go through textContent and can never be
    // interpreted as HTML/script. Only a static skeleton is written.
    const doc = win.document;
    doc.write("<!DOCTYPE html><html><head></head><body></body></html>");
    doc.close();

    const titleEl = doc.createElement("title");
    titleEl.textContent = `Table ${table.table_number} QR Code`;
    doc.head.appendChild(titleEl);

    const style = doc.createElement("style");
    style.textContent =
      "body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,sans-serif}" +
      "h2{margin-bottom:0.5rem}p{color:#666;font-size:0.85rem;margin-top:0.25rem}";
    doc.head.appendChild(style);

    const heading = doc.createElement("h2");
    heading.textContent = `Table ${table.table_number}`;
    doc.body.appendChild(heading);

    // The QR SVG is app-generated; import it as a parsed node (no re-serialisation).
    doc.body.appendChild(doc.importNode(svg, true));

    const caption = doc.createElement("p");
    caption.textContent = venue?.name || "";
    doc.body.appendChild(caption);

    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tables & QR Codes</h2>
          <p className="text-muted-foreground">{tables.length} tables configured</p>
          <p className="text-xs text-muted-foreground mt-1">QR codes are permanent and safe to print as stickers. They never expire.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Add Table</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Table number (e.g. 1, A1)" value={form.table_number} onChange={(e) => setForm((f) => ({ ...f, table_number: e.target.value }))} />
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Zone</Label>
                <Select value={form.zone_id} onValueChange={(v) => setForm((f) => ({ ...f, zone_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a zone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ZONE}>No zone</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {zones.length === 0
                    ? "No zones yet — create them in Settings → Zones."
                    : "The zone decides which menu this QR shows and whether diners can run a tab."}
                </p>
              </div>
              <Input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
              <details className="border border-border rounded-lg">
                <summary className="px-4 py-2.5 text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">POS Integration</summary>
                <div className="px-4 pb-4 pt-2">
                  <Label className="text-sm font-medium mb-1.5 block">POS Table ID</Label>
                  <Input placeholder="External POS table identifier" value={form.pos_table_id} onChange={(e) => setForm((f) => ({ ...f, pos_table_id: e.target.value }))} />
                </div>
              </details>
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
            <p className="text-muted-foreground mb-4">Add tables to generate permanent QR codes for your venue</p>
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Table {table.table_number}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently invalidate the QR code for this table. If you've printed stickers, they will stop working. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteTable(table.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete Table
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {table.qr_code && (
                  <div
                    id={`qr-${table.id}`}
                    className="flex justify-center p-3 bg-white rounded-lg cursor-pointer border border-border hover:border-primary transition-colors"
                    onClick={() => setQrDialogTable(table)}
                  >
                    <QRCodeSVG value={table.qr_code} size={120} />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => downloadQr(table)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setQrDialogTable(table)}>
                      <QrCode className="h-3.5 w-3.5 mr-1" /> Enlarge
                    </Button>
                  </div>
                  <Button variant="default" size="sm" className="w-full text-xs" onClick={() => setPreviewTable(table)}>
                    <Smartphone className="h-3.5 w-3.5 mr-1" /> Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* QR code zoom dialog with print */}
      <Dialog open={!!qrDialogTable} onOpenChange={(open) => { if (!open) setQrDialogTable(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Table {qrDialogTable?.table_number} QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4" ref={printRef}>
            <div id="qr-zoom" className="bg-white p-4 rounded-lg">
              {qrDialogTable?.qr_code && <QRCodeSVG value={qrDialogTable.qr_code} size={256} />}
            </div>
            <p className="text-xs text-muted-foreground text-center">This QR code is permanent and will never expire.</p>
            <p className="text-[10px] text-muted-foreground text-center break-all">{qrDialogTable?.qr_code}</p>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => qrDialogTable && downloadQr(qrDialogTable)}>
                <Download className="h-4 w-4 mr-1" /> Download SVG
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => qrDialogTable && printQr(qrDialogTable)}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
            <Button className="w-full" onClick={() => { if (qrDialogTable) { setPreviewTable(qrDialogTable); setQrDialogTable(null); } }}>
              <Smartphone className="h-4 w-4 mr-1" /> Preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile preview overlay: intentionally not a Dialog so it cannot auto-dismiss from iframe/focus events. */}
      {previewTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-preview-title"
            className="relative flex h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 id="table-preview-title" className="text-lg font-semibold leading-none text-foreground">
                Table {previewTable.table_number} — Mobile Preview
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewTable(null)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close preview</span>
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MobilePreviewFrame>
                {venue && (
                  <iframe
                    src={getPreviewUrl(previewTable)}
                    className="h-full w-full border-0"
                    title={`Mobile preview for table ${previewTable.table_number}`}
                  />
                )}
              </MobilePreviewFrame>
            </div>
            <div className="flex flex-col gap-2 border-t border-border p-4">
              <p className="text-center text-xs break-all text-muted-foreground">{getPreviewUrl(previewTable)}</p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(getPreviewUrl(previewTable), "_blank", "noopener,noreferrer")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open live page
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
