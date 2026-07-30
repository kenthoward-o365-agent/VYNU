import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeHttpUrl } from "@/lib/url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Cable, ExternalLink, RefreshCw, Settings } from "lucide-react";
import HLPosPanel from "@/components/venue/HLPosPanel";

interface Provider {
  id: string;
  slug: string;
  name: string;
  auth_type: string;
  status: string;
  is_active: boolean;
  capabilities: Record<string, boolean>;
  docs_url: string | null;
}

interface ConnectionRow {
  id: string;
  venue_id: string;
  connection_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  pos_providers: { slug: string; name: string } | null;
  venues: { name: string } | null;
}

export default function AdminIntegrations() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [configVenueId, setConfigVenueId] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: provs }, { data: conns }] = await Promise.all([
      (supabase as any).from("pos_providers").select("*").order("name"),
      (supabase as any).from("venue_pos_integrations")
        .select("id, venue_id, connection_status, last_sync_at, last_error, pos_providers(slug,name), venues(name)")
        .order("last_sync_at", { ascending: false, nullsFirst: false }),
    ]);
    setProviders((provs ?? []) as Provider[]);
    setConnections((conns ?? []) as ConnectionRow[]);
    setLoading(false);
  }

  async function toggleProvider(p: Provider) {
    const { error } = await (supabase as any).from("pos_providers").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("Updated"); void load(); }
  }

  async function testConnection(venueId: string) {
    setTesting(venueId);
    const { data, error } = await supabase.functions.invoke("pos-test-connection", { body: { venue_id: venueId } });
    setTesting(null);
    if (error) toast.error(error.message);
    else if ((data as any)?.ok) toast.success((data as any).message);
    else toast.error((data as any)?.message ?? "Test failed");
    void load();
  }

  const statusColor = (s: string) =>
    s === "connected" ? "default" : s === "error" ? "destructive" : s === "connecting" ? "secondary" : "outline";

  const releaseColor = (s: string) =>
    s === "ga" ? "default" : s === "beta" ? "secondary" : s === "deprecated" ? "destructive" : "outline";

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Cable className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">POS Integrations</h1>
          <p className="text-muted-foreground">Adapters Tab-Less builds to vendor POS APIs (outbound).</p>
        </div>
      </div>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers ({providers.length})</TabsTrigger>
          <TabsTrigger value="connections">Connections ({connections.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => {
              const docsUrl = safeHttpUrl(p.docs_url);
              return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {p.name}
                        <Badge variant={releaseColor(p.status)}>{p.status.toUpperCase()}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">{p.slug} · {p.auth_type}</CardDescription>
                    </div>
                    <Switch checked={p.is_active} onCheckedChange={() => toggleProvider(p)} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(p.capabilities ?? {}).filter(([, v]) => v).map(([k]) => (
                      <Badge key={k} variant="outline" className="text-xs">{k.replace(/_/g, " ")}</Badge>
                    ))}
                  </div>
                  {docsUrl && (
                    <a href={docsUrl} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="connections">
          <Card>
            <CardHeader><CardTitle>Venue connections</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="text-muted-foreground">Loading…</p> : connections.length === 0 ? (
                <p className="text-muted-foreground">No venue POS integrations yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venue</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last sync</TableHead>
                      <TableHead>Last error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connections.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.venues?.name ?? c.venue_id.slice(0, 8)}</TableCell>
                        <TableCell>{c.pos_providers?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant={statusColor(c.connection_status)}>{c.connection_status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs text-destructive">
                          {c.last_error ?? ""}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {c.pos_providers?.slug === "hl_exceed" && (
                            <Button size="sm" variant="outline" onClick={() => setConfigVenueId(c.venue_id)}>
                              <Settings className="h-3 w-3 mr-1" />
                              Configure
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={testing === c.venue_id}
                                  onClick={() => testConnection(c.venue_id)}>
                            <RefreshCw className={`h-3 w-3 mr-1 ${testing === c.venue_id ? "animate-spin" : ""}`} />
                            Test
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!configVenueId} onOpenChange={(o) => !o && setConfigVenueId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>H&L Exceed configuration</DialogTitle>
          </DialogHeader>
          {configVenueId && <HLPosPanel venueId={configVenueId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
