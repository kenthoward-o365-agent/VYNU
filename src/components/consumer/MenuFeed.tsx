import { useState, useRef } from "react";
import { Plus, Minus, ChevronLeft, ChevronRight, Flame, Leaf, AlertTriangle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  dietary_tags: string[] | null;
  allergens: string[] | null;
  is_available: boolean | null;
  category_id: string | null;
}

interface MenuCategory {
  id: string;
  name: string;
}

interface MenuFeedProps {
  items: MenuItem[];
  categories: MenuCategory[];
  onAddToCart: (item: MenuItem) => void;
}

const CategoryChips = ({
  categories,
  activeCategory,
  onSelect,
}: {
  categories: MenuCategory[];
  activeCategory: string | null;
  onSelect: (id: string | null) => void;
}) => (
  <ScrollArea className="w-full pt-3 pb-2 px-4 shrink-0">
    <div className="flex gap-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
          !activeCategory
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-muted-foreground border-border hover:text-foreground"
        )}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
            activeCategory === cat.id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:text-foreground"
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);

const QuantitySelector = ({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (q: number) => void;
}) => (
  <div className="flex items-center gap-1">
    <button
      onClick={() => onChange(Math.max(1, quantity - 1))}
      className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
    <span className="w-6 text-center text-sm font-medium">{quantity}</span>
    <button
      onClick={() => onChange(quantity + 1)}
      className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  </div>
);

const MenuItemRow = ({
  item,
  quantity,
  onQuantityChange,
}: {
  item: MenuItem;
  quantity: number;
  onQuantityChange: (qty: number) => void;
}) => {
  const isAvailable = item.is_available ?? true;

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-xl border transition-colors",
        !isAvailable && "opacity-50",
        quantity > 0 ? "border-primary bg-primary/5" : "border-border bg-card"
      )}
    >
      {/* Column A: Image */}
      <div className="h-16 w-16 rounded-lg overflow-hidden shrink-0 bg-muted">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20">
            <Flame className="h-6 w-6 text-primary/30" />
          </div>
        )}
      </div>

      {/* Column B: Name, Description, Tags */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold leading-tight truncate">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {!isAvailable && (
            <Badge variant="destructive" className="text-[9px] gap-0.5 px-1.5 py-0">
              <Ban className="h-2 w-2" /> 86'd
            </Badge>
          )}
          {item.dietary_tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0">
              <Leaf className="h-2 w-2" /> {tag}
            </Badge>
          ))}
          {item.allergens?.map((allergen) => (
            <Badge key={allergen} variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0 text-warning border-warning/30">
              <AlertTriangle className="h-2 w-2" /> {allergen}
            </Badge>
          ))}
        </div>
      </div>

      {/* Column C: Price & Quantity */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-sm font-bold text-primary">${item.price.toFixed(2)}</span>
        <QuantitySelector quantity={quantity} onChange={(q) => onQuantityChange(isAvailable ? q : 0)} />
      </div>
    </div>
  );
};

/* ── Mobile full-screen card (original TikTok-style) ── */
const MobileCardFeed = ({
  items,
  onAddToCart,
}: {
  items: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartY = useRef(0);

  const currentItem = items[currentIndex];
  const isAvailable = currentItem?.is_available ?? true;

  const goNext = () => { if (currentIndex < items.length - 1) setCurrentIndex(currentIndex + 1); };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex(currentIndex - 1); };
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
  };

  if (!currentItem) return null;

  return (
    <div className="flex-1 relative overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="absolute top-2 left-0 right-0 z-10 flex justify-center gap-1">
        {items.slice(Math.max(0, currentIndex - 3), Math.min(items.length, currentIndex + 4)).map((_, i) => {
          const actualIndex = Math.max(0, currentIndex - 3) + i;
          return (
            <div key={actualIndex} className={cn("h-1 rounded-full transition-all", actualIndex === currentIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30")} />
          );
        })}
      </div>

      <div className={cn("h-[55%] bg-muted relative", !isAvailable && "grayscale opacity-50")}>
        {currentItem.image_url ? (
          <img src={currentItem.image_url} alt={currentItem.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20">
            <Flame className="h-16 w-16 text-primary/30" />
          </div>
        )}
        {!isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-background/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              <span className="text-sm font-semibold text-destructive">Currently Unavailable</span>
            </div>
          </div>
        )}
        {currentIndex > 0 && (
          <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/50 backdrop-blur rounded-full p-1">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {currentIndex < items.length - 1 && (
          <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/50 backdrop-blur rounded-full p-1">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <div className="absolute bottom-3 right-3 bg-background/70 backdrop-blur text-xs px-2 py-1 rounded-full">
          {currentIndex + 1} / {items.length}
        </div>
      </div>

      <div className={cn("h-[45%] flex flex-col px-5 pt-4 pb-20", !isAvailable && "opacity-60")}>
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-bold leading-tight flex-1 mr-3">{currentItem.name}</h2>
          <span className="text-xl font-bold text-primary shrink-0">${currentItem.price.toFixed(2)}</span>
        </div>
        {currentItem.description && <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{currentItem.description}</p>}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {!isAvailable && <Badge variant="destructive" className="text-[10px] gap-1"><Ban className="h-2.5 w-2.5" />86'd</Badge>}
          {currentItem.dietary_tags?.map((tag) => <Badge key={tag} variant="secondary" className="text-[10px] gap-1"><Leaf className="h-2.5 w-2.5" />{tag}</Badge>)}
          {currentItem.allergens?.map((allergen) => <Badge key={allergen} variant="outline" className="text-[10px] gap-1 text-warning border-warning/30"><AlertTriangle className="h-2.5 w-2.5" />{allergen}</Badge>)}
        </div>
        <div className="mt-auto">
          <Button onClick={() => onAddToCart(currentItem)} className="w-full h-12 rounded-2xl text-base gap-2" disabled={!isAvailable}>
            <Plus className="h-5 w-5" />
            {isAvailable ? "Add to Order" : "Unavailable"}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ── Main MenuFeed ── */
const MenuFeed = ({ items, categories, onAddToCart }: MenuFeedProps) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  

  const filteredItems = items.filter((item) => {
    if (activeCategory && item.category_id !== activeCategory) return false;
    return true;
  });

  const handleCategorySelect = (id: string | null) => {
    setActiveCategory(id);
    setCurrentIndex(0);
  };

  const handleQuantityChange = (itemId: string, qty: number) => {
    setQuantities((prev) => {
      if (qty <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: qty };
    });
  };

  const selectedCount = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  const handleAddAllToCart = () => {
    Object.entries(quantities).forEach(([itemId, qty]) => {
      const item = items.find((i) => i.id === itemId);
      if (item && qty > 0) {
        for (let i = 0; i < qty; i++) onAddToCart(item);
      }
    });
    setQuantities({});
  };

  if (filteredItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)] px-6">
        <p className="text-muted-foreground">No items available</p>
      </div>
    );
  }

  // List view for all screen sizes
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] relative">
      <CategoryChips categories={categories} activeCategory={activeCategory} onSelect={handleCategorySelect} />
      <ScrollArea className="flex-1 px-4 pb-24">
        <div className="space-y-2 py-2">
          {filteredItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              quantity={quantities[item.id] || 0}
              onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Floating Add to Order button */}
      {selectedCount > 0 && (
        <div className="absolute bottom-20 left-4 right-4 z-10">
          <Button
            onClick={handleAddAllToCart}
            className="w-full h-12 rounded-2xl text-base gap-2 shadow-lg"
          >
            <Plus className="h-5 w-5" />
            Add {selectedCount} {selectedCount === 1 ? "item" : "items"} to Order
          </Button>
        </div>
      )}
    </div>
  );
};

export default MenuFeed;
