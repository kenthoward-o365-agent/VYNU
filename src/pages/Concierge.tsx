import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenue } from "@/contexts/VenueContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Phone, RefreshCw, Settings2, Send } from "lucide-react";
import { sortConversations } from "@/lib/guest-suite";

interface Conversation {
  id: string;
  channel: string;
  guest_phone: string | null;
  guest_name: string | null;
  status: string;
  outcome: string | null;
  booking_id: string | null;
  summary: string | null;
  started_at: string;
  last_message_at: string;
}

interface Message {
  id: number;
  role: string;
  body: string;
  created_at: string;
}

interface ConciergeSettings {
  is_enabled: boolean;
  greeting: string | null;
  phone_number: string | null;
  forward_to_phone: string | null;
  channels: { sms?: boolean; phone?: boolean; whatsapp?: boolean };
}

const CHANNEL_ICON: Record<string, typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  web: MessageSquare,
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  needs_human: "destructive",
  resolved: "secondary",
};

const OUTCOMES = ["answered", "booked", "message_taken", "handed_off", "missed"] as const;

export default function Concierge() {
  const { venue } = useVenue();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ConciergeSettings | null>(null);
  const [resolveOutcome, setResolveOutcome] = useState<string>("answered");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("concierge_conversations")
      .select("id, channel, guest_phone, guest_name, status, outcome, booking_id, summary, started_at, last_message_at")
      .eq("venue_id", venue.id)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) toast.error("Failed to load conversations");
    else {
      const convs = sortConversations(data as Conversation[]);
      setConversations(convs);
      if (selected) {
        const still = convs.find((c) => c.id === selected.id);
        if (still) setSelected(still);
      }
    }
    setLoading(false);
  };

  const loadMessages = async (conv: Conversation) => {
    const { data, error } = await supabase
      .from("concierge_messages")
      .select("id, role, body, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at");
    if (error) toast.error("Failed to load transcript");
    else setMessages(data as Message[]);
  };

  useEffect(() => {
    load();
  }, [venue?.id]);

  useEffect(() => {
    if (selected) loadMessages(selected);
    else setMessages([]);
  }, [selected?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const openSettings = async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("concierge_settings")
      .select("is_enabled, greeting, phone_number, forward_to_phone, channels")
      .eq("venue_id", venue.id)
      .maybeSingle();
    setSettings(
      (data as ConciergeSettings | null) ?? {
        is_enabled: false,
        greeting: null,
        phone_number: null,
        forward_to_phone: null,
        channels: { sms: true, phone: false, whatsapp: false },
      },
    );
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    if (!venue || !settings) return;
    const { error } = await supabase.from("concierge_settings").upsert({
      venue_id: venue.id,
      is_enabled: settings.is_enabled,
      greeting: settings.greeting?.trim() || null,
      phone_number: settings.phone_number?.trim() || null,
      forward_to_phone: settings.forward_to_phone?.trim() || null,
      channels: settings.channels,
    });
    if (error) return toast.error(error.message);
    toast.success("Concierge settings saved");
    setSettingsOpen(false);
  };

  const sendReply = async () => {
    if (!selected || !venue || !reply.trim()) return;
    const body = reply.trim();
    setReply("");
    const { error } = await supabase.from("concierge_messages").insert({
      conversation_id: selected.id,
      venue_id: venue.id,
      role: "staff",
      body,
      meta: { staff_user: user?.id ?? null },
    });
    if (error) return toast.error(error.message);
    await supabase
      .from("concierge_conversations")
      .update({ last_message_at: new Date().toISOString(), status: "active" })
      .eq("id", selected.id);
    loadMessages(selected);
    load();
  };

  const resolve = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("concierge_conversations")
      .update({
        status: "resolved",
        outcome: resolveOutcome,
        ended_at: new Date().toISOString(),
      })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Conversation resolved");
    load();
  };

  if (!venue) return <div className="p-6 text-muted-foreground">Select a venue first.</div>;

  const needsHuman = conversations.filter((c) => c.status === "needs_human").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Concierge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One front door: every call, text and WhatsApp answered, booked and remembered.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {needsHuman > 0 && (
            <Badge variant="destructive">{needsHuman} needs a human</Badge>
          )}
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={openSettings}>
            <Settings2 className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Conversation list */}
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 text-muted-foreground">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No conversations yet. When the concierge answers a call or message,
              the dialogue lands here — and on the guest record.
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {conversations.map((c) => {
                const Icon = CHANNEL_ICON[c.channel] ?? MessageSquare;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/30 ${
                      selected?.id === c.id ? "bg-muted/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">
                        {c.guest_name || c.guest_phone || "Unknown guest"}
                      </span>
                      <Badge variant={STATUS_BADGE[c.status] ?? "outline"} className="text-xs ml-auto">
                        {c.status === "needs_human" ? "Needs human" : c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {c.summary ||
                        new Date(c.last_message_at).toLocaleString("en-AU", {
                          day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                        })}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Transcript */}
        <Card className="p-0 overflow-hidden flex flex-col min-h-[420px]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6">
              Select a conversation to read the transcript.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">
                  {selected.guest_name || selected.guest_phone || "Unknown guest"}
                </span>
                <Badge variant="outline" className="text-xs capitalize">{selected.channel}</Badge>
                {selected.booking_id && <Badge variant="secondary" className="text-xs">Booked</Badge>}
                {selected.outcome && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {selected.outcome.replace("_", " ")}
                  </Badge>
                )}
                {selected.status !== "resolved" && (
                  <span className="ml-auto flex items-center gap-2">
                    <Select value={resolveOutcome} onValueChange={setResolveOutcome}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTCOMES.map((o) => (
                          <SelectItem key={o} value={o} className="capitalize">
                            {o.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={resolve}>Resolve</Button>
                  </span>
                )}
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[52vh]">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "guest"
                        ? "bg-muted text-foreground"
                        : m.role === "system"
                          ? "mx-auto text-xs text-muted-foreground bg-transparent text-center"
                          : "ml-auto bg-primary text-primary-foreground"
                    }`}
                  >
                    {m.role !== "system" && (
                      <p className="text-[10px] uppercase tracking-wide opacity-70 mb-0.5">
                        {m.role === "vee" ? "Vee" : m.role}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages.</p>
                )}
              </div>
              {selected.status !== "resolved" && (
                <div className="p-3 border-t border-border flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
                    placeholder="Reply as staff…"
                  />
                  <Button onClick={sendReply} size="icon" aria-label="Send reply">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Concierge settings</DialogTitle>
          </DialogHeader>
          {settings && (
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-sm font-medium">Concierge enabled</span>
                <Switch
                  checked={settings.is_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, is_enabled: v })}
                />
              </label>
              <div className="space-y-1">
                <Label htmlFor="greeting">Greeting</Label>
                <Textarea
                  id="greeting"
                  rows={2}
                  value={settings.greeting || ""}
                  onChange={(e) => setSettings({ ...settings, greeting: e.target.value })}
                  placeholder={`Hi, you've reached ${venue.name}. How can I help?`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cphone">Concierge number</Label>
                  <Input
                    id="cphone"
                    value={settings.phone_number || ""}
                    onChange={(e) => setSettings({ ...settings, phone_number: e.target.value })}
                    placeholder="+61…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fphone">Hand-off number</Label>
                  <Input
                    id="fphone"
                    value={settings.forward_to_phone || ""}
                    onChange={(e) => setSettings({ ...settings, forward_to_phone: e.target.value })}
                    placeholder="Venue phone"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Channels</Label>
                {(["sms", "whatsapp", "phone"] as const).map((ch) => (
                  <label key={ch} className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-sm capitalize">
                      {ch === "sms" ? "SMS" : ch === "whatsapp" ? "WhatsApp" : "Phone (voice)"}
                    </span>
                    <Switch
                      checked={!!settings.channels?.[ch]}
                      onCheckedChange={(v) =>
                        setSettings({ ...settings, channels: { ...settings.channels, [ch]: v } })
                      }
                    />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  Inbound messages are answered by Vee via the concierge-inbound
                  function once a messaging provider is connected.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={saveSettings}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
