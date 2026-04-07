import { useState, useRef } from "react";
import { Plus, ChevronLeft, ChevronRight, Flame, Leaf, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

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

const MenuFeed = ({ items, categories, onAddToCart }: MenuFeedProps) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartY = useRef(0);

  const filteredItems = items.filter((item) => {
    if (!item.is_available) return false;
    if (activeCategory && item.category_id !== activeCategory) return false;
    return true;
  });

  const currentItem = filteredItems[currentIndex];

  const goNext = () => {
    if (currentIndex < filteredItems.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  if (!currentItem) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)] px-6">
        <p className="text-muted-foreground">No items available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Category Chips */}
      <ScrollArea className="w-full pt-3 pb-2 px-4 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveCategory(null); setCurrentIndex(0); }}
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
              onClick={() => { setActiveCategory(cat.id); setCurrentIndex(0); }}
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

      {/* Full-Screen Card */}
      <div
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress Dots */}
        <div className="absolute top-2 left-0 right-0 z-10 flex justify-center gap-1">
          {filteredItems.slice(
            Math.max(0, currentIndex - 3),
            Math.min(filteredItems.length, currentIndex + 4)
          ).map((_, i) => {
            const actualIndex = Math.max(0, currentIndex - 3) + i;
            return (
              <div
                key={actualIndex}
                className={cn(
                  "h-1 rounded-full transition-all",
                  actualIndex === currentIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                )}
              />
            );
          })}
        </div>

        {/* Image Area */}
        <div className="h-[55%] bg-muted relative">
          {currentItem.image_url ? (
            <img
              src={currentItem.image_url}
              alt={currentItem.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20">
              <Flame className="h-16 w-16 text-primary/30" />
            </div>
          )}

          {/* Swipe Arrows */}
          {currentIndex > 0 && (
            <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/50 backdrop-blur rounded-full p-1">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {currentIndex < filteredItems.length - 1 && (
            <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/50 backdrop-blur rounded-full p-1">
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Counter */}
          <div className="absolute bottom-3 right-3 bg-background/70 backdrop-blur text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {filteredItems.length}
          </div>
        </div>

        {/* Item Details */}
        <div className="h-[45%] flex flex-col px-5 pt-4 pb-20">
          <div className="flex items-start justify-between mb-2">
            <h2 className="text-xl font-bold leading-tight flex-1 mr-3">{currentItem.name}</h2>
            <span className="text-xl font-bold text-primary shrink-0">
              ${currentItem.price.toFixed(2)}
            </span>
          </div>

          {currentItem.description && (
            <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
              {currentItem.description}
            </p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {currentItem.dietary_tags?.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] gap-1">
                <Leaf className="h-2.5 w-2.5" />
                {tag}
              </Badge>
            ))}
            {currentItem.allergens?.map((allergen) => (
              <Badge key={allergen} variant="outline" className="text-[10px] gap-1 text-warning border-warning/30">
                <AlertTriangle className="h-2.5 w-2.5" />
                {allergen}
              </Badge>
            ))}
          </div>

          <div className="mt-auto">
            <Button
              onClick={() => onAddToCart(currentItem)}
              className="w-full h-12 rounded-2xl text-base gap-2"
            >
              <Plus className="h-5 w-5" />
              Add to Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MenuFeed;
