import { useState, useRef, useEffect, useCallback } from "react";
import { Send, X, Sparkles, Users, AlertTriangle, Mic, MicOff, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { functionErrorMessage } from "@/lib/function-errors";

interface Message {
  role: "user" | "assistant";
  content: string;
  splitCheck?: number;
  cartTotal?: number;
  managerCalled?: boolean;
}

interface LastOrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface AIChatOverlayProps {
  venueId: string;
  onClose: () => void;
  onAddToCart: (item: { id: string; name: string; price: number }) => void;
  menuItems: { id: string; name: string; price: number; description: string | null; dietary_tags: string[] | null; allergens: string[] | null }[];
  dinerId?: string | null;
  tableId?: string | null;
  lastOrderItems?: LastOrderItem[];
  cartTotal?: number;
  onSessionCreated?: (sessionId: string) => void;
}

const AIChatOverlay = ({ venueId, onClose, onAddToCart, menuItems, dinerId, tableId, lastOrderItems, cartTotal = 0, onSessionCreated }: AIChatOverlayProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState("Vee");
  const [agentIcon, setAgentIcon] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInput("(Speech recognition not supported on this browser)");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognition.start();
  }, [isListening]);

  useEffect(() => {
    const loadConfig = async () => {
      const { data: rows } = await supabase
        .rpc("get_venue_ai_config_public", { _venue_id: venueId });
      const data = Array.isArray(rows) ? rows[0] : null;


      const name = data?.agent_name || "Vee";
      const icon = data?.agent_icon_url || null;
      const greeting = data?.opening_message ||
        `Hey! 👋 I'm ${name}, your AI server. Tell me what you're in the mood for and I'll find the perfect dish. Try saying:\n\n- "Something spicy under $25"\n- "I'm vegetarian, what do you recommend?"\n- "Another round please"`;

      setAgentName(name);
      setAgentIcon(icon);
      setMessages([{ role: "assistant", content: greeting }]);
      setConfigLoaded(true);
    };
    loadConfig();
  }, [venueId]);

  // Create chat session on mount
  useEffect(() => {
    const createSession = async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ venue_id: venueId, diner_id: dinerId || null, table_id: tableId || null })
        .select("id")
        .single();

      if (error) {
        console.error("Failed to create chat session:", error);
        return;
      }
      if (data) {
        sessionIdRef.current = data.id;
        onSessionCreated?.(data.id);
      }
    };
    createSession();

    // Close session on unmount
    return () => {
      if (sessionIdRef.current) {
        supabase.from("chat_sessions").update({
          ended_at: new Date().toISOString(),
        }).eq("id", sessionIdRef.current).then(({ error }) => {
          if (error) console.error("Failed to close chat session:", error);
        });
      }
    };
  }, [venueId, dinerId, tableId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const updateSessionStats = async (newMessages: number, newItems: number) => {
    if (!sessionIdRef.current) return;

    // Use raw SQL-style increment via RPC isn't available, so we read-then-write
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("message_count, items_added")
      .eq("id", sessionIdRef.current)
      .maybeSingle();

    if (session) {
      const { error } = await supabase
        .from("chat_sessions")
        .update({
          message_count: session.message_count + newMessages,
          items_added: session.items_added + newItems,
        })
        .eq("id", sessionIdRef.current);

      if (error) console.error("Failed to update session stats:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    // Stop speech recognition if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("diner-chat", {
        body: {
          message: userMsg.content,
          venue_id: venueId,
          menu_items: menuItems.map((i) => ({
            id: i.id, name: i.name, price: i.price,
            description: i.description, dietary_tags: i.dietary_tags, allergens: i.allergens,
          })),
          conversation: messages.filter(m => !m.splitCheck && !m.managerCalled).map((m) => ({ role: m.role, content: m.content })),
          diner_id: dinerId || null,
          table_id: tableId || null,
          last_order_items: lastOrderItems || [],
        },
      });

      const failure = await functionErrorMessage({ data, error });
      if (failure) throw new Error(failure);

      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply || "Sorry, I couldn't process that. Try again!",
      };

      // Attach split check info if present
      if (data.split_check > 0) {
        assistantMsg.splitCheck = data.split_check;
        assistantMsg.cartTotal = cartTotal;
      }

      // Attach manager called flag
      if (data.call_manager) {
        assistantMsg.managerCalled = true;
      }

      setMessages((prev) => [...prev, assistantMsg]);

      const itemsAdded = data.suggested_items?.length || 0;
      if (data.suggested_items?.length > 0) {
        data.suggested_items.forEach((item: { id: string; name: string; price: number }) => {
          onAddToCart(item);
        });
      }

      // Update session stats inline (2 messages: user + assistant)
      await updateSessionStats(2, itemsAdded);

      // Log messages for analytics
      if (sessionIdRef.current) {
        const { error: logError } = await supabase.from("chat_messages_log").insert([
          { session_id: sessionIdRef.current, venue_id: venueId, role: "user", content: userMsg.content, had_items_added: false },
          { session_id: sessionIdRef.current, venue_id: venueId, role: "assistant", content: assistantMsg.content, had_items_added: itemsAdded > 0 },
        ]);
        if (logError) console.error("Failed to log chat messages:", logError);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Oops, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!configLoaded) {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex items-center justify-center max-w-md mx-auto">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 max-w-md mx-auto z-[60] bg-background flex flex-col"
      style={{
        height: "calc(100dvh - 4rem - env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
          Menu
        </button>
        <div className="flex items-center gap-2">
          <img
            src={agentIcon || "/brand/ai-agent-default.svg"}
            alt={agentName}
            className="h-6 w-6 rounded-full object-cover"
          />
          <h2 className="font-semibold text-sm">{agentName}</h2>
        </div>
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
          aria-label="Close chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-border rounded-bl-sm"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_ul]:my-1">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>

            {/* Split Check Card */}
            {msg.splitCheck && msg.splitCheck > 0 && (
              <div className="max-w-[85%] mt-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Split {msg.splitCheck} Ways</p>
                </div>
                {(msg.cartTotal || cartTotal) > 0 ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium">${(msg.cartTotal || cartTotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-primary font-semibold">
                      <span>Per person</span>
                      <span>${((msg.cartTotal || cartTotal) / msg.splitCheck).toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Add items to your cart to see the split amount</p>
                )}
              </div>
            )}

            {/* Manager Called Card */}
            {msg.managerCalled && (
              <div className="max-w-[85%] mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    A team member has been notified
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="max-w-[85%] bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3 pb-[env(safe-area-inset-bottom,8px)] shrink-0 overflow-hidden">
        <div className="flex items-center gap-1.5 w-full max-w-full overflow-hidden">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="What are you in the mood for?"
            className="flex-1 min-w-0 bg-secondary rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={toggleSpeechRecognition}
            type="button"
            className={cn(
              "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-colors",
              isListening ? "bg-destructive text-destructive-foreground" : "border border-input bg-background hover:bg-accent"
            )}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatOverlay;
