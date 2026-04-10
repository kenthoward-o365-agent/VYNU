import { useState, useEffect, useRef } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { UpsellSuggestion } from "./UpsellPrompt";

interface CartSuggestionsProps {
  venueId: string;
  venueName: string;
  cartItems: { id: string; name: string; quantity: number }[];
  menuItems: { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; dietary_tags: string[] | null }[];
  dismissedIds: Set<string>;
  onAdd: (item: { id: string; name: string; price: number }) => void;
  onDismiss: (itemId: string) => void;
}

const CartSuggestions = ({
  venueId,
  venueName,
  cartItems,
  menuItems,
  dismissedIds,
  onAdd,
  onDismiss,
}: CartSuggestionsProps) => {
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || cartItems.length === 0) return;
    fetchedRef.current = true;
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upsell-suggest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            trigger: "cart_suggestions",
            cart_items: cartItems,
            menu_items: menuItems,
            venue_name: venueName,
          }),
        }
      );
      const data = await resp.json();
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions.filter((s: UpsellSuggestion) => !dismissedIds.has(s.item_id)));
      }
    } catch (e) {
      console.error("Cart suggestions error:", e);
    }
    setLoading(false);
  };

  const displayed = suggestions.filter((s) => !dismissedIds.has(s.item_id)).slice(0, 2);

  if (displayed.length === 0 && !loading) return null;

  return (
    <div className="px-5 pb-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        <span>You might also like</span>
      </div>
      {loading && displayed.length === 0 && (
        <div className="flex gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex-1 h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}
      <div className="flex gap-3">
        {displayed.map((s) => (
          <div
            key={s.item_id}
            className="flex-1 bg-card rounded-xl border border-border p-3 flex items-center gap-2.5"
          >
            {s.image_url && (
              <img
                src={s.image_url}
                alt={s.name}
                className="w-12 h-12 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{s.name}</p>
              <p className="text-xs text-primary font-semibold">${s.price.toFixed(2)}</p>
            </div>
            <button
              onClick={() => {
                onAdd({ id: s.item_id, name: s.name, price: s.price });
                onDismiss(s.item_id);
              }}
              className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CartSuggestions;
