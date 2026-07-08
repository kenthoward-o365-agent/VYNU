import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BookOpen, Download, Upload, Trash2, RefreshCw, FileText, ShieldCheck, FolderOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BUCKET = "admin-kb";

const FOLDERS = [
  { id: "packaging", label: "Packaging & Pricing", description: "Package tier definitions, feature grids, commercial sell sheets." },
  { id: "pci", label: "PCI DSS", description: "Self-Assessment Questionnaires, AoCs, scope evidence." },
  { id: "architecture", label: "Architecture & Security", description: "System diagrams, security whitepapers, data-flow docs." },
  { id: "policies", label: "Policies & Runbooks", description: "Info-sec policy, incident response, secret rotation." },
  { id: "vendor", label: "Vendor / TPSP", description: "Third-party AoCs, SOC 2 reports, responsibility matrices." },
  { id: "client", label: "Client Responses", description: "Completed customer security questionnaires." },
];

interface KBFile {
  name: string;
  size: number;
  updated_at: string;
  path: string;
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export default function AdminKnowledgeBase() {
  const [files, setFiles] = useState<Record<string, KBFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFolder, setUploadFolder] = useState(FOLDERS[0].id);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KBFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalCount = useMemo(
    () => Object.values(files).reduce((n, list) => n + list.length, 0),
    [files],
  );

  async function loadAll() {
    setLoading(true);
    const next: Record<string, KBFile[]> = {};
    for (const f of FOLDERS) {
      const { data, error } = await supabase.storage.from(BUCKET).list(f.id, {
        limit: 100, sortBy: { column: "updated_at", order: "desc" },
      });
      if (error) {
        toast({ title: `Failed to load ${f.label}`, description: error.message, variant: "destructive" });
        next[f.id] = [];
        continue;
      }
      next[f.id] = (data || [])
        .filter((d) => d.name && !d.name.endsWith("/"))
        .map((d) => ({
          name: d.name,
          size: (d.metadata as any)?.size ?? 0,
          updated_at: d.updated_at ?? (d as any).created_at ?? "",
          path: `${f.id}/${d.name}`,
        }));
    }
    setFiles(next);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleDownload(file: KBFile) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.path, 60);
    if (error || !data) {
      toast({ title: "Download failed", description: error?.message, variant: "destructive" });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleUpload(file: File) {
    setUploading(true);
    const path = `${uploadFolder}/${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    setUploading(false);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Uploaded", description: file.name });
    setUploadOpen(false);
    await loadAll();
  }

  async function handleDelete(file: KBFile) {
    const { error } = await supabase.storage.from(BUCKET).remove([file.path]);
    setDeleteTarget(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted", description: file.name });
    await loadAll();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <BookOpen className="h-7 w-7 text-primary" />
            Admin Knowledge Base
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Central library of compliance and security documents used to respond to customer IT,
            Security, and Risk teams. Only Tab-Less platform admins can view, upload, or replace
            files here. All downloads use short-lived signed links.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Upload className="mr-2 h-4 w-4" /> Upload document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload to Knowledge Base</DialogTitle>
                <DialogDescription>
                  Uploading the same filename to the same folder replaces the existing version.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Folder</Label>
                  <Select value={uploadFolder} onValueChange={setUploadFolder}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FOLDERS.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf,.xlsx,.md,.txt,.png,.jpg,.zip"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                    disabled={uploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max 50&nbsp;MB. .docx, .pdf, .xlsx, .md, .png, .jpg, .zip.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <p className="text-2xl font-semibold">{totalCount}</p>
              <p className="text-xs text-muted-foreground">Documents in library</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm font-semibold">Tab-Less admins only</p>
              <p className="text-xs text-muted-foreground">RLS on storage.objects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FolderOpen className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm font-semibold">{FOLDERS.length} categories</p>
              <p className="text-xs text-muted-foreground">Packaging, PCI, Architecture, Policies, Vendor, Client</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {FOLDERS.map((folder) => {
        const list = files[folder.id] || [];
        return (
          <Card key={folder.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    {folder.label}
                    <Badge variant="secondary">{list.length}</Badge>
                  </CardTitle>
                  <CardDescription>{folder.description}</CardDescription>
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => { setUploadFolder(folder.id); setUploadOpen(true); }}
                >
                  <Upload className="mr-2 h-4 w-4" /> Add to {folder.label}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {list.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No documents yet. Upload one to get started.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead className="w-28">Size</TableHead>
                      <TableHead className="w-48">Last updated</TableHead>
                      <TableHead className="w-48 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((f) => (
                      <TableRow key={f.path}>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell>{fmtSize(f.size)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtDate(f.updated_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="mr-2" onClick={() => handleDownload(f)}>
                            <Download className="mr-1 h-4 w-4" /> Download
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(f)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> will be permanently removed
              from the Knowledge Base. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
