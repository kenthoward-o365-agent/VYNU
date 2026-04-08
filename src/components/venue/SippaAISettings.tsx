import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Upload, X, MessageSquare, Bot } from "lucide-react";

interface SippaConfig {
  id?: string;
  venue_id: string;
  agent_name: string;
  agent_icon_url: string | null;
  opening_message: string;
  tone: string;
  chat_mode: string;
  venue_context: string;
}

const toneOptions = [
  {
    value: "aussie",
    label: "Full Aussie 🇦🇺",
    description: "G'day mate! Laid-back, friendly, uses Aussie slang like \"arvo\", \"reckon\", \"no worries\"",
    sample: "G'day! 👋 Welcome in, mate. What are ya keen on? I reckon I can sort you out with something ripper.",
  },
  {
    value: "british",
    label: "British 🇬🇧",
    description: "Polished, warm, uses British expressions like \"brilliant\", \"lovely\", \"cheers\"",
    sample: "Hello there! 👋 Lovely to have you. What takes your fancy this evening? I'd be delighted to suggest something brilliant.",
  },
  {
    value: "north_american",
    label: "North American 🇺🇸",
    description: "Upbeat, casual, uses American expressions like \"awesome\", \"you bet\", \"for sure\"",
    sample: "Hey there! 👋 Welcome! What sounds good to you today? I've got some awesome recommendations if you're up for it.",
  },
];

const chatModeOptions = [
  {
    value: "chat_optional",
    label: "Chat Optional",
    description: "Menu shows first, chat is a floating button. Best for most venues.",
  },
  {
    value: "chat_first",
    label: "Chat First",
    description: "Chat opens automatically when diners arrive. Menu accessible behind it.",
  },
  {
    value: "chat_only",
    label: "Chat Only",
    description: "No traditional menu — everything ordered through the AI chat experience.",
  },
];

interface Props {
  venueId: string;
}

export default function SippaAISettings({ venueId }: Props) {
  const [config, setConfig] = useState<SippaConfig>({
    venue_id: venueId,
    agent_name: "Sippa",
    agent_icon_url: null,
    opening_message: "Hey! 👋 I'm your AI server. Tell me what you're in the mood for and I'll find the perfect dish.",
    tone: "aussie",
    chat_mode: "chat_optional",
    venue_context: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("venue_ai_config")
        .select("*")
        .eq("venue_id", venueId)
        .maybeSingle();

      if (data) {
        setConfig({
          id: data.id,
          venue_id: data.venue_id,
          agent_name: data.agent_name,
          agent_icon_url: data.agent_icon_url,
          opening_message: data.opening_message || "",
          tone: data.tone,
          chat_mode: data.chat_mode,
          venue_context: (data as any).venue_context || "",
        });
        setIsNew(false);
      }
      setLoading(false);
    };
    fetch();
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    const payload = {
      venue_id: venueId,
      agent_name: config.agent_name,
      agent_icon_url: config.agent_icon_url,
      opening_message: config.opening_message,
      tone: config.tone,
      chat_mode: config.chat_mode,
      venue_context: config.venue_context,
    };

    if (isNew) {
      const { error } = await supabase.from("venue_ai_config").insert(payload);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Sippa AI configured!");
        setIsNew(false);
      }
    } else {
      const { error } = await supabase.from("venue_ai_config").update(payload).eq("venue_id", venueId);
      if (error) toast.error(error.message);
      else toast.success("Settings saved");
    }
    setSaving(false);
  };

  const uploadIcon = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `sippa-icons/${venueId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("venue-assets")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("venue-assets").getPublicUrl(path);
    setConfig((c) => ({ ...c, agent_icon_url: urlData.publicUrl }));
    toast.success("Icon uploaded");
    setUploading(false);
  };

  const selectedTone = toneOptions.find((t) => t.value === config.tone);

  if (loading) return <p className="text-muted-foreground">Loading Sippa AI settings...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Agent Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agent Identity
          </CardTitle>
          <CardDescription>Customise how your AI chat agent appears to diners</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Agent Name</Label>
            <Input
              value={config.agent_name}
              onChange={(e) => setConfig((c) => ({ ...c, agent_name: e.target.value }))}
              placeholder="Sippa"
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">This name is shown to diners in the chat header</p>
          </div>

          <div>
            <Label>Agent Icon</Label>
            <div className="flex items-center gap-4 mt-2">
              {config.agent_icon_url ? (
                <div className="relative">
                  <img
                    src={config.agent_icon_url}
                    alt="Agent icon"
                    className="w-14 h-14 rounded-full object-cover border-2 border-border"
                  />
                  <button
                    onClick={() => setConfig((c) => ({ ...c, agent_icon_url: null }))}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadIcon(e.target.files[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {uploading ? "Uploading..." : "Upload Icon"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Square image recommended (e.g. 200×200px)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Opening Message */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Opening Message
          </CardTitle>
          <CardDescription>The first message diners see when they open the chat</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={config.opening_message}
            onChange={(e) => setConfig((c) => ({ ...c, opening_message: e.target.value }))}
            rows={4}
            placeholder="Hey! 👋 I'm your AI server..."
          />
          <p className="text-xs text-muted-foreground">
            Tip: Include suggestions like "Try saying: Something spicy under $25"
          </p>
        </CardContent>
      </Card>

      {/* Tone & Personality */}
      <Card>
        <CardHeader>
          <CardTitle>Tone & Personality</CardTitle>
          <CardDescription>Choose the vibe and language style for your AI agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={config.tone}
            onValueChange={(v) => setConfig((c) => ({ ...c, tone: v }))}
            className="space-y-3"
          >
            {toneOptions.map((t) => (
              <label
                key={t.value}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  config.tone === t.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value={t.value} className="mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>

          {selectedTone && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
              <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[80%]">
                {selectedTone.sample}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat Mode */}
      <Card>
        <CardHeader>
          <CardTitle>Chat Mode</CardTitle>
          <CardDescription>Control how the AI chat appears in the diner experience</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={config.chat_mode}
            onValueChange={(v) => setConfig((c) => ({ ...c, chat_mode: v }))}
            className="space-y-3"
          >
            {chatModeOptions.map((m) => (
              <label
                key={m.value}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  config.chat_mode === m.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value={m.value} className="mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Venue Knowledge */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Venue Knowledge
          </CardTitle>
          <CardDescription>
            Give your AI agent context about your venue so it can answer questions about your story, specialties, events, and more
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={config.venue_context}
            onChange={(e) => setConfig((c) => ({ ...c, venue_context: e.target.value }))}
            rows={8}
            placeholder={`Paste information about your venue here. For example:\n\n• Our chef Marco trained in Italy for 10 years\n• We source all seafood from the Sydney Fish Market daily\n• Live jazz every Friday & Saturday from 7pm\n• Our signature dish is the 12-hour slow-cooked lamb shoulder\n• We have a private dining room for up to 20 guests\n• Happy hour runs 4-6pm weekdays with $8 house wines`}
          />
          <p className="text-xs text-muted-foreground">
            This info is fed to your AI agent so it can answer diner questions like "Tell me about the chef" or "Do you have live music?"
          </p>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          <Sparkles className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Sippa AI Settings"}
        </Button>
      </div>
    </div>
  );
}
