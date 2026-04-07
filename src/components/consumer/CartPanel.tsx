import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartPanelProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onPlaceOrder: () => void;
  loading?: boolean;
}

const CartPanel = ({ items, onUpdateQuantity, onRemove, onPlaceOrder, loading }: CartPanelProps) => {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
      </div>

      <div className="flex-1 overflow-auto px-5 pb-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 bg-card rounded-xl border border-border p-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.name}</p>
              <p className="text-primary font-semibold text-sm">${(item.price * item.quantity).toFixed(2)}</p>
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
        ))}
      </div>

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
