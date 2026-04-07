import { useState, useRef, useEffect } from "react";
import { Send, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatOverlayProps {
  venueId: string;
  onClose: () => void;
  onAddToCart: (item: { id: string; name: string; price: number }) => void;
  menuItems: { id: string; name: string; price: number; description: string | null; dietary_tags: string[] | null; allergens: string[] | null }[];
}

const AIChatOverlay = ({ venueId, onClose, onAddToCart, menuItems }: AIChatOverlayProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey! 👋 I'm your AI server. Tell me what you're in the mood for and I'll find the perfect dish. Try saying:\n\n- \"Something spicy under $25\"\n- \"I'm vegetarian, what do you recommend?\"\n- \"What's the most popular dish?\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("diner-chat", {
        body: {
          message: userMsg.content,
          venue_id: venueId,
          menu_items: menuItems.map((i) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            description: i.description,
            dietary_tags: i.dietary_tags,
            allergens: i.allergens,
          })),
          conversation: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply || "Sorry, I couldn't process that. Try again!",
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // If AI suggested items to add
      if (data.suggested_items?.length > 0) {
        data.suggested_items.forEach((item: { id: string; name: string; price: number }) => {
          onAddToCart(item);
        });
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

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">AI Server</h2>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
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
      <div className="border-t border-border px-4 py-3 pb-6 shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="What are you in the mood for?"
            className="flex-1 bg-secondary rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIChatOverlay;
