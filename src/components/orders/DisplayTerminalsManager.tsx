import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy, RefreshCcw, Unplug, Monitor } from "lucide-react";

interface DisplayArea {
  id: string;
  name: string;
  color: string;
}

interface Terminal {
  id: string;
  name: string;
  device_token: string | null;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
  paired_at: string | null;
  last_seen_at: string | null;
  is_active: boolean;
  area_ids: string[];
}

interface Props {
  venueId: string;
}

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 1) code += "-";
  }
  return code;
}

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

export default function DisplayTerminalsManager({ venueId }: Props) {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [areas, setAreas] = useState<DisplayArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Terminal> | null>(null);
  const [pairingDialog, setPairingDialog] = useState<{ code: string; expires: Date; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [areasRes, termsRes] = await Promise.all([
      supabase.from("venue_display_areas").select("id, name, color").eq("venue_id", venueId).eq("is_active", true).order("display_order"),
      supabase.from("display_terminals" as any).select("*, display_terminal_areas(display_area_id)").eq("venue_id", venueId).order("created_at"),
    ]);
    setAreas((areasRes.data as DisplayArea[]) || []);
    const list = ((termsRes.data as any[]) || []).map((t) => ({
      ...t,
      area_ids: (t.display_terminal_areas || []).map((a: any) => a.display_area_id),
    }));
    setTerminals(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, [venueId]);

  const openNew = () => {
    setEditing({ name: "", area_ids: [], is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (t: Terminal) => {
    setEditing({ ...t });
    setDialogOpen(true);
  };

  const toggleArea = (id: string) => {
    if (!editing) return;
    const current = editing.area_ids || [];
    setEditing({
      ...editing,
      area_ids: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!editing.area_ids?.length) {
      toast.error("Pick at least one Display Area");
      return;
    }

    if (editing.id) {
      const { error } = await supabase
        .from("display_terminals" as any)
        .update({ name: editing.name.trim(), is_active: editing.is_active ?? true })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);

      await supabase.from("display_terminal_areas" as any).delete().eq("terminal_id", editing.id);
      const rows = (editing.area_ids || []).map((aid) => ({ terminal_id: editing.id, display_area_id: aid }));
      if (rows.length) await supabase.from("display_terminal_areas" as any).insert(rows);
      toast.success("Terminal updated");
    } else {
      const code = generatePairingCode();
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      const { data, error } = await supabase
        .from("display_terminals" as any)
        .insert({
          venue_id: venueId,
          name: editing.name.trim(),
          pairing_code: code,
          pairing_code_expires_at: expires.toISOString(),
        } as any)
        .select()
        .single();
      if (error) return toast.error(error.message);

      const tid = (data as any).id;
      const rows = (editing.area_ids || []).map((aid) => ({ terminal_id: tid, display_area_id: aid }));
      if (rows.length) await supabase.from("display_terminal_areas" as any).insert(rows);

      setPairingDialog({ code, expires, name: editing.name.trim() });
      toast.success("Terminal created");
    }

    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const remove = async (t: Terminal) => {
    if (!confirm(`Delete terminal "${t.name}"? This will also unpair the device.`)) return;
    const { error } = await supabase.from("display_terminals" as any).delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Terminal deleted");
    load();
  };

  const regenerateCode = async (t: Terminal) => {
    const code = generatePairingCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    const { error } = await supabase
      .from("display_terminals" as any)
      .update({ pairing_code: code, pairing_code_expires_at: expires.toISOString() })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    setPairingDialog({ code, expires, name: t.name });
    load();
  };

  const unpair = async (t: Terminal) => {
    if (!confirm(`Unpair "${t.name}"? The device will lose access immediately.`)) return;
    const { error } = await supabase.rpc("unpair_display_terminal" as any, { _terminal_id: t.id });
    if (error) return toast.error(error.message);
    toast.success("Terminal unpaired");
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied");
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Display Terminals</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Register physical devices (Mac mini, iPad, kitchen TV) and bind each to one or more Display Areas. Once paired, that device only sees the orders routed to its assigned areas.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Terminal
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : terminals.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            No terminals yet. Click "Add Terminal" to register your first physical device.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {terminals.map((t) => {
              const online = isOnline(t.last_seen_at);
              const areaChips = areas.filter((a) => t.area_ids.includes(a.id));
              const codeValid = t.pairing_code && t.pairing_code_expires_at && new Date(t.pairing_code_expires_at) > new Date();
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <Monitor className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{t.name}</span>
                      {!t.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      {t.device_token ? (
                        online ? (
                          <Badge className="text-xs bg-emerald-500 text-white border-transparent">● Online</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Offline</Badge>
                        )
                      ) : codeValid ? (
                        <Badge variant="outline" className="text-xs">Pending pairing</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Not paired</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {areaChips.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No areas assigned</span>
                      ) : (
                        areaChips.map((a) => (
                          <span
                            key={a.id}
                            className="text-xs px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: a.color }}
                          >
                            {a.name}
                          </span>
                        ))
                      )}
                    </div>
                    {t.last_seen_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last seen {new Date(t.last_seen_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {!t.device_token && (
                    <Button variant="ghost" size="icon" onClick={() => regenerateCode(t)} aria-label="Generate code" title="Generate pairing code">
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  )}
                  {t.device_token && (
                    <Button variant="ghost" size="icon" onClick={() => unpair(t)} aria-label="Unpair" title="Unpair device">
                      <Unplug className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(t)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Edit / Create Terminal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Terminal" : "New Terminal"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="t-name">Terminal name *</Label>
                <Input
                  id="t-name"
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Kitchen Mac mini"
                />
                <p className="text-xs text-muted-foreground">Use a descriptive name so you can identify it later.</p>
              </div>

              <div className="space-y-2">
                <Label>Display Areas *</Label>
                <p className="text-xs text-muted-foreground">Pick which areas this terminal will show.</p>
                <div className="flex flex-wrap gap-2">
                  {areas.map((a) => {
                    const selected = (editing.area_ids || []).includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleArea(a.id)}
                        className={`text-sm px-3 py-1.5 rounded-full border-2 transition ${
                          selected ? "text-white" : "text-foreground bg-background"
                        }`}
                        style={{
                          backgroundColor: selected ? a.color : undefined,
                          borderColor: a.color,
                        }}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pairing Code Dialog */}
      <Dialog open={!!pairingDialog} onOpenChange={(o) => { if (!o) setPairingDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pairing code for "{pairingDialog?.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              On the physical device, sign into H&L OrderNOW, open the Orders page, click "Pair this Terminal", and enter this code:
            </p>
            <div className="flex items-center justify-center gap-2 py-4 bg-muted rounded-lg">
              <code className="text-3xl font-mono font-bold tracking-widest text-foreground">
                {pairingDialog?.code}
              </code>
              <Button variant="ghost" size="icon" onClick={() => pairingDialog && copyCode(pairingDialog.code)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Valid for 10 minutes (until {pairingDialog?.expires.toLocaleTimeString()}).
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setPairingDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
