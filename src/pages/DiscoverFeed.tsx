// Public VYNU Discover feed — no auth, reads via the get_discover_feed RPC
// (published posts of active venues only). This is the one guest-facing
// surface of the guest suite; nothing here may reference Club/gaming data.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

interface FeedPost {
  post_id: string;
  venue_id: string;
  venue_name: string;
  venue_city: string | null;
  venue_logo_url: string | null;
  kind: string;
  title: string;
  body: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  cta: string;
  published_at: string | null;
}

const KIND_LABEL: Record<string, string> = {
  offer: "Offer",
  event: "Event",
  announcement: "News",
};

export default function DiscoverFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_discover_feed", { _limit: 50 });
      if (!error && data) setPosts(data as FeedPost[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-muted-foreground">
            VYNU
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">Discover</h1>
          <p className="text-sm text-muted-foreground mt-1">
            What's on at venues near you.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing on right now — check back soon.
          </p>
        ) : (
          posts.map((p) => (
            <article
              key={p.post_id}
              className="rounded-xl border border-border overflow-hidden bg-card"
            >
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt=""
                  className="w-full max-h-64 object-cover"
                  loading="lazy"
                />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {p.venue_logo_url && (
                    <img
                      src={p.venue_logo_url}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  )}
                  <span className="text-sm font-medium text-foreground">{p.venue_name}</span>
                  {p.venue_city && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {p.venue_city}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {KIND_LABEL[p.kind] ?? p.kind}
                  </Badge>
                </div>
                <h2 className="text-lg font-semibold text-foreground">{p.title}</h2>
                {p.body && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.body}</p>
                )}
                {(p.starts_at || p.ends_at) && (
                  <p className="text-xs text-muted-foreground">
                    {p.starts_at &&
                      new Date(p.starts_at).toLocaleDateString("en-AU", {
                        weekday: "short", day: "numeric", month: "short",
                      })}
                    {p.starts_at && p.ends_at && " – "}
                    {p.ends_at &&
                      new Date(p.ends_at).toLocaleDateString("en-AU", {
                        weekday: "short", day: "numeric", month: "short",
                      })}
                  </p>
                )}
              </div>
            </article>
          ))
        )}
      </main>

      <footer className="max-w-2xl mx-auto px-4 pb-8">
        <p className="text-xs text-muted-foreground">
          Powered by VYNU — the guest suite for Australian venues.
        </p>
      </footer>
    </div>
  );
}
