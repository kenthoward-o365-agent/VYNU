import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Globe, Palette, FileText, Settings as SettingsIcon, Star } from "lucide-react";
import { toast } from "sonner";
import type { Brand } from "@/lib/white-label";
import { useBrandContext } from "@/contexts/BrandContext";

const EMPTY: Partial<Brand> = {
  slug: "",
  name: "",
  product_name: "",
  is_default: false,
  app_host: "",
  consumer_host: "",
  api_host: "",
  marketing_host: "",
  logo_primary_url: "",
  favicon_url: "",
  theme: {},
  support_email: "",
  legal_company_name: "",
  privacy_url: "",
  terms_url: "",
  show_developers_page: true,
  show_knowledge_base: true,
  show_powered_by: false,
  enabled_pos_providers: [],
  kb_overrides: {},
  tagline: "",
};

export default function AdminWhiteLabel() {
  const { isTablessAdmin } = useVenue();
  const { refresh } = useBrandContext();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [editing, setEditing] = useState<Partial<Brand> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("white_label_brands").select("*").order("is_default", { ascending: false }).order("name");
    if (error) toast.error(error.message);
    setBrands((data as unknown as Brand[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isTablessAdmin) {
    return <div className="p-6 text-muted-foreground">Admin access required.</div>;
  }

  const openNew = () => { setEditing({ ...EMPTY }); setOpen(true); };
  const openEdit = (b: Brand) => { setEditing({ ...b }); setOpen(true); };

  const setDefault = async (id: string) => {
    // Clear current default, then set new
    await supabase.from("white_label_brands").update({ is_default: false }).eq("is_default", true);
    const { error } = await supabase.from("white_label_brands").update({ is_default: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Default brand updated");
    load();
    refresh();
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.slug || !editing.name || !editing.product_name) {
      toast.error("Slug, name and product name are required");
      return;
    }
    const payload: any = {
      slug: editing.slug,
      name: editing.name,
      product_name: editing.product_name,
      tagline: editing.tagline || null,
      app_host: editing.app_host || null,
      consumer_host: editing.consumer_host || null,
      api_host: editing.api_host || null,
      marketing_host: editing.marketing_host || null,
      logo_primary_url: editing.logo_primary_url || null,
      logo_mono_white_url: editing.logo_mono_white_url || null,
      logo_mono_black_url: editing.logo_mono_black_url || null,
      favicon_url: editing.favicon_url || null,
      app_icon_url: editing.app_icon_url || null,
      og_image_url: editing.og_image_url || null,
      theme: editing.theme || {},
      support_email: editing.support_email || null,
      support_url: editing.support_url || null,
      legal_company_name: editing.legal_company_name || null,
      privacy_url: editing.privacy_url || null,
      terms_url: editing.terms_url || null,
      show_developers_page: !!editing.show_developers_page,
      show_knowledge_base: !!editing.show_knowledge_base,
      show_powered_by: !!editing.show_powered_by,
      enabled_pos_providers: editing.enabled_pos_providers || [],
      kb_overrides: editing.kb_overrides || {},
      auth_email_from: editing.auth_email_from || null,
      auth_email_reply_to: editing.auth_email_reply_to || null,
    };
    let error;
    if ((editing as Brand).id) {
      ({ error } = await supabase.from("white_label_brands").update(payload).eq("id", (editing as Brand).id));
    } else {
      ({ error } = await supabase.from("white_label_brands").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success("Brand saved");
    setOpen(false);
    setEditing(null);
    load();
    refresh();
  };

  const setThemeVar = (key: string, value: string) => {
    setEditing((prev) => prev ? { ...prev, theme: { ...(prev.theme as any), [key]: value } } : prev);
  };

  const themeKeys: Array<{ key: string; label: string; placeholder: string }> = [
    { key: "primary", label: "Primary", placeholder: "252 85% 60%" },
    { key: "primary-foreground", label: "Primary Foreground", placeholder: "0 0% 100%" },
    { key: "accent", label: "Accent", placeholder: "252 85% 96%" },
    { key: "sidebar-background", label: "Sidebar BG", placeholder: "240 6% 10%" },
    { key: "sidebar-foreground", label: "Sidebar FG", placeholder: "0 0% 98%" },
    { key: "sidebar-accent", label: "Sidebar Accent", placeholder: "240 4% 16%" },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">White Label</h1>
          <p className="text-sm text-muted-foreground">Tenant brands. Each brand can claim its own custom domain, theme, copy, knowledge base content and POS provider list.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Brand</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Custom domain setup</CardTitle>
          <CardDescription>
            Each brand requires a real custom domain. Add the domain in <strong>Project Settings → Domains</strong>, point DNS to Lovable, then create or edit a brand here and set its <code>app_host</code> / <code>consumer_host</code> to match.
            <br />
            Existing Shyndig QR stickers continue to resolve at <code>shyndig.lovable.app</code> — only newly generated QRs for venues pinned to a non-default brand emit that brand's host.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Brands</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="text-muted-foreground">Loading…</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>App Host</TableHead>
                  <TableHead>Consumer Host</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell><code className="text-xs">{b.slug}</code></TableCell>
                    <TableCell className="text-xs">{b.app_host || "—"}</TableCell>
                    <TableCell className="text-xs">{b.consumer_host || "—"}</TableCell>
                    <TableCell>{b.is_default ? <Badge><Star className="h-3 w-3 mr-1" />Default</Badge> : null}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {!b.is_default && <Button size="sm" variant="outline" onClick={() => setDefault(b.id)}>Set default</Button>}
                      <Button size="sm" onClick={() => openEdit(b)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {brands.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center py-6">No brands yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(editing as Brand)?.id ? `Edit Brand: ${editing?.name}` : "New Brand"}</DialogTitle>
          </DialogHeader>

          {editing && (
            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="identity"><SettingsIcon className="h-4 w-4 mr-1" />Identity</TabsTrigger>
                <TabsTrigger value="hosts"><Globe className="h-4 w-4 mr-1" />Hosts</TabsTrigger>
                <TabsTrigger value="theme"><Palette className="h-4 w-4 mr-1" />Theme</TabsTrigger>
                <TabsTrigger value="copy"><FileText className="h-4 w-4 mr-1" />Copy</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Slug *</Label><Input value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="posvendor-x" /></div>
                  <div><Label>Brand Name *</Label><Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="PosVendor X" /></div>
                  <div><Label>Product Name *</Label><Input value={editing.product_name || ""} onChange={(e) => setEditing({ ...editing, product_name: e.target.value })} placeholder="Shown in the UI" /></div>
                  <div><Label>Tagline</Label><Input value={editing.tagline || ""} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Logo (primary URL)</Label><Input value={editing.logo_primary_url || ""} onChange={(e) => setEditing({ ...editing, logo_primary_url: e.target.value })} placeholder="https://…/logo.png" /></div>
                  <div><Label>Favicon URL</Label><Input value={editing.favicon_url || ""} onChange={(e) => setEditing({ ...editing, favicon_url: e.target.value })} /></div>
                  <div><Label>App Icon URL</Label><Input value={editing.app_icon_url || ""} onChange={(e) => setEditing({ ...editing, app_icon_url: e.target.value })} /></div>
                  <div><Label>OG Image URL</Label><Input value={editing.og_image_url || ""} onChange={(e) => setEditing({ ...editing, og_image_url: e.target.value })} /></div>
                </div>
              </TabsContent>

              <TabsContent value="hosts" className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>App Host (operator console)</Label><Input value={editing.app_host || ""} onChange={(e) => setEditing({ ...editing, app_host: e.target.value })} placeholder="app.posvendor.com" /></div>
                  <div><Label>Consumer Host (QR / diner app)</Label><Input value={editing.consumer_host || ""} onChange={(e) => setEditing({ ...editing, consumer_host: e.target.value })} placeholder="order.posvendor.com" /></div>
                  <div><Label>API Host</Label><Input value={editing.api_host || ""} onChange={(e) => setEditing({ ...editing, api_host: e.target.value })} placeholder="api.posvendor.com" /></div>
                  <div><Label>Marketing Host</Label><Input value={editing.marketing_host || ""} onChange={(e) => setEditing({ ...editing, marketing_host: e.target.value })} placeholder="posvendor.com" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Hosts must already be connected as custom domains in Project Settings → Domains.</p>
              </TabsContent>

              <TabsContent value="theme" className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">HSL values (no <code>hsl()</code> wrapper, no commas — e.g. <code>252 85% 60%</code>). Empty values fall back to platform defaults.</p>
                <div className="grid grid-cols-2 gap-3">
                  {themeKeys.map((t) => (
                    <div key={t.key}>
                      <Label>{t.label}</Label>
                      <Input
                        value={(editing.theme as any)?.[t.key] || ""}
                        onChange={(e) => setThemeVar(t.key, e.target.value)}
                        placeholder={t.placeholder}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="copy" className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Support email</Label><Input value={editing.support_email || ""} onChange={(e) => setEditing({ ...editing, support_email: e.target.value })} /></div>
                  <div><Label>Support URL</Label><Input value={editing.support_url || ""} onChange={(e) => setEditing({ ...editing, support_url: e.target.value })} /></div>
                  <div><Label>Legal entity</Label><Input value={editing.legal_company_name || ""} onChange={(e) => setEditing({ ...editing, legal_company_name: e.target.value })} /></div>
                  <div><Label>Privacy URL</Label><Input value={editing.privacy_url || ""} onChange={(e) => setEditing({ ...editing, privacy_url: e.target.value })} /></div>
                  <div><Label>Terms URL</Label><Input value={editing.terms_url || ""} onChange={(e) => setEditing({ ...editing, terms_url: e.target.value })} /></div>
                  <div><Label>Auth email "from"</Label><Input value={editing.auth_email_from || ""} onChange={(e) => setEditing({ ...editing, auth_email_from: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Knowledge base overrides (JSON)</Label>
                  <Textarea
                    rows={6}
                    value={JSON.stringify(editing.kb_overrides || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const v = JSON.parse(e.target.value || "{}");
                        setEditing({ ...editing, kb_overrides: v });
                      } catch { /* keep typing */ }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Shape: <code>{`{ "section-id": { "title": "…", "body": "…" } }`}</code></p>
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div><Label>Show Developers page</Label><p className="text-xs text-muted-foreground">Public API docs for partners</p></div>
                  <Switch checked={!!editing.show_developers_page} onCheckedChange={(v) => setEditing({ ...editing, show_developers_page: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>Show Knowledge Base</Label></div>
                  <Switch checked={!!editing.show_knowledge_base} onCheckedChange={(v) => setEditing({ ...editing, show_knowledge_base: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>Show "Powered by Shyndig" footer</Label></div>
                  <Switch checked={!!editing.show_powered_by} onCheckedChange={(v) => setEditing({ ...editing, show_powered_by: v })} />
                </div>
                <div>
                  <Label>Enabled POS providers (comma separated slugs)</Label>
                  <Input
                    value={(editing.enabled_pos_providers || []).join(",")}
                    onChange={(e) => setEditing({ ...editing, enabled_pos_providers: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                    placeholder="doshii,mock"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Empty = show all providers.</p>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save Brand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
