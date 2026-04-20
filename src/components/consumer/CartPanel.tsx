import { Minus, Plus, Trash2, ShoppingCart, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import CartSuggestions from "./CartSuggestions";
import type { SelectedModifier } from "./ItemDetailScreen";

export interface CartItem {
  /** Unique line key — combines menu_item_id + modifier signature + notes hash */
  id: string;
  menu_item_id: string;
  name: string;
  /** Base price (per unit, before modifiers) */
  price: number;
  /** Original menu price before any pricing rule (per unit). */
  originalPrice?: number;
  /** Name of the pricing rule that adjusted the price, if any. */
  ruleName?: string | null;
  quantity: number;
  modifiers: SelectedModifier[];
  notes: string;
}

interface CartPanelProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onPlaceOrder: () => void;
  loading?: boolean;
  venueId?: string;
  venueName?: string;
  menuItems?: { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; dietary_tags: string[] | null }[];
  dismissedSuggestions?: Set<string>;
  onAddToCart?: (item: { id: string; name: string; price: number }) => void;
  onDismissSuggestion?: (itemId: string) => void;
  sessionMode?: "solo" | "group";
  groupDisplayName?: string | null;
  groupDinerCount?: number;
  onSwitchMode?: () => void;
}

const lineTotalPerUnit = (item: CartItem) =>
  item.price + item.modifiers.reduce((s, m) => s + (m.price || 0), 0);

const CartPanel = ({
  items,
  onUpdateQuantity,
  onRemove,
  onPlaceOrder,
  loading,
  venueId,
  venueName,
  menuItems,
  dismissedSuggestions,
  onAddToCart,
  onDismissSuggestion,
  sessionMode = "solo",
  groupDisplayName = null,
  groupDinerCount = 1,
  onSwitchMode,
}: CartPanelProps) => {
  const total = items.reduce((sum, item) => sum + lineTotalPerUnit(item) * item.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-6 text-center">
        <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-1">Your order is empty</h2>
        <p className="text-muted-foreground text-sm">Browse the menu and add items to get started</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-5 pt-5 pb-2">
        <h2 className="text-xl font-bold">Your Order</h2>
        <p className="text-muted-foreground text-sm">{items.length} item{items.length !== 1 ? "s" : ""}</p>

        <button
          type="button"
          onClick={onSwitchMode}
          disabled={!onSwitchMode}
          className={
            sessionMode === "group"
              ? "mt-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15 transition-colors disabled:cursor-default"
              : "mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:cursor-default"
          }
        >
          {sessionMode === "group" ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
          {sessionMode === "group"
            ? `Group order${groupDisplayName ? ` · ${groupDisplayName}` : ""}${groupDinerCount > 1 ? ` · ${groupDinerCount} people` : ""}`
            : "Solo order"}
          {onSwitchMode && items.length === 0 && <span className="opacity-60">· change</span>}
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-4 space-y-3">
        {items.map((item) => {
          const perUnit = lineTotalPerUnit(item);
          const addons = item.modifiers.filter((m) => m.type === "addon" || m.type === "choice");
          const removals = item.modifiers.filter((m) => m.type === "removal");
          return (
            <div key={item.id} className="flex items-start gap-3 bg-card rounded-xl border border-border p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.name}</p>
                {(addons.length > 0 || removals.length > 0 || item.notes) && (
                  <div className="mt-1 space-y-0.5">
                    {addons.map((m) => (
                      <p key={m.modifier_id} className="text-[11px] text-muted-foreground">
                        + {m.name}
                        {m.price > 0 ? ` (+$${m.price.toFixed(2)})` : ""}
                      </p>
                    ))}
                    {removals.map((m) => (
                      <p key={m.modifier_id} className="text-[11px] text-muted-foreground">
                        ✕ {m.name}
                      </p>
                    ))}
                    {item.notes && (
                      <p className="text-[11px] text-muted-foreground italic">"{item.notes}"</p>
                    )}
                  </div>
                )}
                <p className="text-primary font-semibold text-sm mt-1.5">
                  ${(perUnit * item.quantity).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onUpdateQuantity(item.id, -1)}
                  className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.id, 1)}
                  className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onRemove(item.id)}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors ml-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Cart Suggestions */}
      {venueId && venueName && menuItems && onAddToCart && onDismissSuggestion && dismissedSuggestions && (
        <CartSuggestions
          venueId={venueId}
          venueName={venueName}
          cartItems={items.map((i) => ({ id: i.menu_item_id, name: i.name, quantity: i.quantity }))}
          menuItems={menuItems}
          dismissedIds={dismissedSuggestions}
          onAdd={onAddToCart}
          onDismiss={onDismissSuggestion}
        />
      )}

      {/* Order Summary */}
      <div className="border-t border-border px-5 pt-4 pb-20 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">${total.toFixed(2)}</span>
        </div>
        <Button
          onClick={onPlaceOrder}
          disabled={loading}
          className="w-full h-14 rounded-2xl text-base"
        >
          {loading ? "Processing..." : `Checkout — $${total.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
};

export default CartPanel;
