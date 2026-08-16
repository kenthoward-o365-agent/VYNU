import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, ExternalLink } from "lucide-react";

interface Post {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  cta: string;
  is_published: boolean;
  published_at: string | null;
}

const KIND_LABEL: Record<string, string> = {
  offer: "Offer",
  event: "Event",
  announcement: "Announcement",
};

export default function DiscoverManage() {
  const { venue } = useVenue();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Post> | null>(null);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("discover_posts")
      .select("id, kind, title, body, image_url, starts_at, ends_at, cta, is_published, published_at")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load posts");
    else setPosts(data as Post[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [venue?.id]);

  const save = async () => {
    if (!editing || !venue) return;
    if (!editing.title?.trim()) return toast.error("Title is required");
    const payload = {
      venue_id: venue.id,
      kind: editing.kind || "offer",
      title: editing.title.trim(),
      body: editing.body?.trim() || null,
      image_url: editing.image_url?.trim() || null,
      starts_at: editing.starts_at || null,
      ends_at: editing.ends_at || null,
      cta: editing.cta || "none",
    };
    if (editing.id) {
      const { error } = await supabase.from("discover_posts").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Post updated");
    } else {
      const { error } = await supabase
        .from("discover_posts")
        .insert({ ...payload, created_by: user?.id ?? null });
      if (error) return toast.error(error.message);
      toast.success("Post created");
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const togglePublish = async (p: Post) => {
    const publishing = !p.is_published;
    const { error } = await supabase
      .from("discover_posts")
      .update({
        is_published: publishing,
        published_at: publishing ? new Date().toISOString() : p.published_at,
      })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(publishing ? "Published to Discover" : "Unpublished");
    load();
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Discover</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Offers, events and announcements published to the public VYNU Discover feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/discover" target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              View feed
            </Link>
          </Button>
          <Button size="sm" onClick={() => {
            setEditing({ kind: "offer", cta: "none" });
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New post
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="p-6 text-muted-foreground">
            Nothing yet. Publish an offer or event and guests will find it on Discover.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt=""
                    className="h-12 w-12 rounded-md object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{p.title}</span>
                    <Badge variant="outline" className="text-xs">{KIND_LABEL[p.kind] ?? p.kind}</Badge>
                    {p.is_published ? (
                      <Badge variant="default" className="text-xs">Live</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Draft</Badge>
                    )}
                    {p.ends_at && new Date(p.ends_at) < new Date() && (
                      <Badge variant="destructive" className="text-xs">Expired</Badge>
                    )}
                  </div>
                  {p.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.body}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => togglePublish(p)}>
                  {p.is_published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  variant="ghost" size="icon" aria-label="Edit post"
                  onClick={() => { setEditing({ ...p }); setDialogOpen(true); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit post" : "New post"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="post_title">Title *</Label>
                  <Input
                    id="post_title"
                    value={editing.title || ""}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="e.g. $2 wings every Wednesday"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kind</Label>
                  <Select
                    value={editing.kind || "offer"}
                    onValueChange={(v) => setEditing({ ...editing, kind: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KIND_LABEL).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Call to action</Label>
                  <Select
                    value={editing.cta || "none"}
                    onValueChange={(v) => setEditing({ ...editing, cta: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="book">Book a table</SelectItem>
                      <SelectItem value="order">Order now</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="post_start">Runs from</Label>
                  <Input
                    id="post_start"
                    type="datetime-local"
                    value={editing.starts_at?.slice(0, 16) || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        starts_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="post_end">Until</Label>
                  <Input
                    id="post_end"
                    type="datetime-local"
                    value={editing.ends_at?.slice(0, 16) || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        ends_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="post_image">Image URL</Label>
                  <Input
                    id="post_image"
                    value={editing.image_url || ""}
                    onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="post_body">Body</Label>
                <Textarea
                  id="post_body"
                  rows={3}
                  value={editing.body || ""}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
