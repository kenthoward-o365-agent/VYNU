import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ReadinessResult } from "./useOnboardingReadiness";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: Array<{ name: string; args: any; result: any }>;
}

interface Props {
  venueId: string;
  onReadinessUpdate: (r: ReadinessResult) => void;
  externalPrompt?: { text: string; nonce: number } | null;
}

export function OnboardingChat({ venueId, onReadinessUpdate, externalPrompt }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "G'day! I'm your Self Onboard agent. I'll walk you through everything to take this venue live — from menu and tables to POS choice and a final test order. Where would you like to start? You can also ask me anything along the way.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (externalPrompt?.text) {
      void send(externalPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPrompt?.nonce]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    const userMsg: ChatMessage = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    const history = messages.map((m) => ({ role: m.role, content: m.text }));

    try {
      const { data, error } = await supabase.functions.invoke("onboarding-chat", {
        body: { venue_id: venueId, message: text, history },
      });
      if (error) throw error;
      const reply = (data as any).reply ?? "Done.";
      const toolEvents = (data as any).tool_events ?? [];
      const readiness = (data as any).readiness;
      setMessages((m) => [...m, { role: "assistant", text: reply, tools: toolEvents }]);
      if (readiness) onReadinessUpdate(readiness);
    } catch (e: any) {
      toast.error(e.message ?? "Agent failed");
      setMessages((m) => [...m, { role: "assistant", text: "Sorry — something went wrong. Try again?" }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-lg px-4 py-2 text-sm",
              m.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground",
            )}>
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.text}</p>
              )}
              {m.tools && m.tools.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.tools.map((t, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                      <Wand2 className="h-3 w-3" />
                      <span className="font-mono">{t.name}</span>
                      <span className="ml-auto">{t.result?.ok === false ? "⚠️" : "✓"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask anything, or tell me what to set up next..."
            className="min-h-[44px] max-h-[140px] resize-none"
            disabled={sending}
          />
          <Button onClick={() => void send(input)} disabled={sending || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
