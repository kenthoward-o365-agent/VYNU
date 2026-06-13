import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Trash2, Wrench, Bot, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import copilotIcon from "@/assets/brand/copilot-icon.png";
import { startWalkthrough } from "./walkthroughs";


interface ToolEvent {
  name: string;
  args: any;
  result: any;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
}

const EXAMPLES = [
  "Show me how to add a menu item",
  "Walk me through refunding an order",
  "How do I connect H&L Exceed POS?",
  "What was last night's revenue?",
];

export default function CoPilotPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const { venue } = useVenue();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const venueId = venue?.id;

  // Load conversation on open
  useEffect(() => {
    if (!open || !venueId || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("copilot-chat", {
          body: { venue_id: venueId, action: "load" },
        });
        if (error) throw error;
        if (!cancelled) {
          setMessages(Array.isArray(data?.messages) ? data.messages : []);
          setLoaded(true);
        }
      } catch (e: any) {
        console.error("CoPilot load failed", e);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, venueId, loaded]);

  // Reset when venue changes
  useEffect(() => {
    setMessages([]);
    setLoaded(false);
  }, [venueId]);

  // Autoscroll + focus
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, sending]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending || !venueId) return;
    setSending(true);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    try {
      const { data, error } = await supabase.functions.invoke("copilot-chat", {
        body: { venue_id: venueId, message: text },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const toolEvents = data.tool_events ?? [];
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Done.", tools: toolEvents }]);

      // If the model launched a walkthrough, fire it while keeping the panel open
      // so the user can read the step-by-step directions.
      const wt = toolEvents.find((t: any) => t.name === "start_walkthrough" && t.result?.ok && t.result?.walkthrough_id);
      if (wt) {
        startWalkthrough(wt.result.walkthrough_id);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "CoPilot failed");
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — something went wrong. Try again?" }]);
    } finally {
      setSending(false);
    }
  }, [sending, venueId, onOpenChange]);

  const clearConversation = useCallback(async () => {
    if (!venueId) return;
    try {
      await supabase.functions.invoke("copilot-chat", { body: { venue_id: venueId, action: "clear" } });
      setMessages([]);
      toast.success("Conversation cleared");
    } catch (e: any) {
      toast.error("Couldn't clear conversation");
    }
  }, [venueId]);

  if (!user || !venue) return null;

  return (
    <>
      {/* Subtle backdrop — does NOT close the panel, just dims the app slightly so the chat is readable */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/10 pointer-events-none transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="CoPilot"
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full sm:max-w-[460px] bg-background border-l border-border shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={copilotIcon} alt="" className="h-8 w-8 shrink-0" width={32} height={32} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight truncate">CoPilot</h2>
              <p className="text-xs text-muted-foreground truncate">{venue.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearConversation} className="text-xs text-muted-foreground" title="Clear conversation">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)} aria-label="Close CoPilot">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="space-y-4 pt-4">
              <div className="text-center space-y-2">
                <img src={copilotIcon} alt="" className="h-16 w-16 mx-auto opacity-90" width={64} height={64} />
                <h3 className="text-lg font-semibold">Ask CoPilot anything</h3>
                <p className="text-sm text-muted-foreground px-4">
                  I can look up live operations, analytics, financials and platform how-tos for {venue.name}.
                </p>
              </div>
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Try asking</p>
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-accent text-sm transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm",
              )}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-headings:my-2">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
                {m.tools && m.tools.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" />
                      {m.tools.length} tool{m.tools.length > 1 ? "s" : ""} used
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      {m.tools.map((t, j) => (
                        <div key={j} className="flex items-center gap-2 bg-background/50 rounded px-2 py-1 font-mono text-[11px]">
                          <span className="text-muted-foreground">{t.name}</span>
                          <span className="ml-auto">{t.result?.ok === false ? "⚠️" : "✓"}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask about revenue, orders, invoices, or how things work..."
              className="min-h-[44px] max-h-[140px] resize-none text-sm"
              disabled={sending}
            />
            <Button
              onClick={() => void send(input)}
              disabled={sending || !input.trim()}
              size="icon"
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">CoPilot can make mistakes. Verify important numbers.</p>
        </div>
      </aside>
    </>
  );
}


export function CoPilotButton({ onClick }: { onClick: () => void }) {
  const { venue } = useVenue();
  if (!venue) return null;
  return (
    <button
      onClick={onClick}
      aria-label="Open CoPilot"
      title="CoPilot"
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 rounded-lg",
        "bg-primary/15 text-primary border border-primary/20",
        "hover:bg-primary/25 hover:scale-105 active:scale-95 transition-all",
        "shadow-[0_0_12px_hsl(var(--primary)/0.25)]",
      )}
    >
      <Bot className="h-[18px] w-[18px]" strokeWidth={2.5} />
    </button>
  );
}

export function CoPilotLauncher() {
  const [open, setOpen] = useState(false);
  const { venue } = useVenue();
  if (!venue) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open CoPilot"
        className={cn(
          "fixed bottom-5 right-5 z-40 flex items-center gap-2 pl-2.5 pr-4 py-2 rounded-full",
          "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
          "hover:scale-105 active:scale-95 transition-transform",
        )}
      >
        <Bot className="h-5 w-5" strokeWidth={2.5} />
        <span className="text-sm font-medium">CoPilot</span>
      </button>
      <CoPilotPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
