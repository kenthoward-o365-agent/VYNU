import { useMemo, useState } from "react";
import { Flame, Leaf, AlertTriangle, Ban, Filter, ChevronRight, Search, X } from "lucide-react";
import { optimizedImageUrl } from "@/lib/image-utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { resolvePrice, type RuleIndex } from "@/lib/pricing-utils";
import { groupItemsByCategory } from "@/lib/menu-grouping";

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
  onItemSelect: (item: MenuItem) => void;
  tableNumber?: string;
  sessionMode?: "solo" | "group";
  pricingIndex?: RuleIndex | null;
  /** Allergen tags to auto-apply on first render (from signed-in diner's VYNU ID profile). */
  defaultAllergens?: string[];
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
            : "bg-card text-muted-foreground border-border hover:text-foreground",
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
              : "bg-card text-muted-foreground border-border hover:text-foreground",
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);

const MenuItemRow = ({
  item,
  onSelect,
  dimmed,
  pricingIndex,
}: {
  item: MenuItem;
  onSelect: () => void;
  dimmed?: boolean;
  pricingIndex?: RuleIndex | null;
}) => {
  const isAvailable = item.is_available ?? true;
  const resolved = resolvePrice(item.id, item.price, pricingIndex ?? null);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left overflow-hidden",
        "bg-card border-border hover:border-primary/40 hover:shadow-sm active:scale-[0.99]",
        (!isAvailable || dimmed) && "opacity-50",
      )}
    >
      {/* Image */}
      <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-xl overflow-hidden shrink-0 bg-muted">
        {item.image_url ? (
          <img
            src={optimizedImageUrl(item.image_url, 256, 80, 256)}
            alt={item.name}
            loading="lazy"
            width={112}
            height={112}
            className="w-full h-full object-cover"
            onError={(e) => {
              if (item.image_url && e.currentTarget.src !== item.image_url)
                e.currentTarget.src = item.image_url;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20">
            <Flame className="h-8 w-8 text-primary/30" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <h3 className="text-sm sm:text-base font-semibold leading-tight line-clamp-1">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5 overflow-hidden">
          {!isAvailable && (
            <Badge variant="destructive" className="text-[9px] gap-1 px-1.5 py-0 whitespace-nowrap">
              <Ban className="h-2 w-2" /> Temporarily Not Available
            </Badge>
          )}
          {item.dietary_tags?.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[9px] gap-0.5 px-1.5 py-0"
            >
              <Leaf className="h-2 w-2" /> {tag}
            </Badge>
          ))}
          {item.allergens?.slice(0, 2).map((allergen) => (
            <Badge
              key={allergen}
              variant="outline"
              className="text-[9px] gap-0.5 px-1.5 py-0 text-warning border-warning/30"
            >
              <AlertTriangle className="h-2 w-2" /> {allergen}
            </Badge>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {resolved.hasOverride ? (
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground line-through">
                  ${resolved.originalPrice.toFixed(2)}
                </span>
                <span className="text-sm sm:text-base font-bold text-primary">
                  ${resolved.price.toFixed(2)}
                </span>
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-primary/80 leading-tight">
                {resolved.ruleName}
              </span>
            </div>
          ) : (
            <span className="text-sm sm:text-base font-bold text-primary">
              ${item.price.toFixed(2)}
            </span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors ml-auto" />
        </div>
      </div>
    </button>
  );
};

const MenuFeed = ({
  items,
  categories,
  onItemSelect,
  tableNumber,
  sessionMode = "solo",
  pricingIndex,
  defaultAllergens,
}: MenuFeedProps) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeDietaryFilters, setActiveDietaryFilters] = useState<string[]>([]);
  const [activeAllergenAvoid, setActiveAllergenAvoid] = useState<string[]>(defaultAllergens ?? []);
  const [allergensFromProfile, setAllergensFromProfile] = useState<boolean>(
    !!(defaultAllergens && defaultAllergens.length > 0),
  );

  const allDietaryTags = Array.from(
    new Set(items.flatMap((item) => item.dietary_tags || [])),
  ).sort();

  // Memoised so the `sections` grouping below has a stable input: a fresh array
  // each render would defeat its useMemo whenever only filter state changes.
  // Search matches names and descriptions and deliberately overrides the
  // category chip — typing means "find it anywhere on the menu".
  const searchQuery = search.trim().toLowerCase();
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (searchQuery) {
          return (
            item.name.toLowerCase().includes(searchQuery) ||
            (item.description ?? "").toLowerCase().includes(searchQuery)
          );
        }
        if (activeCategory && item.category_id !== activeCategory) return false;
        return true;
      }),
    [items, activeCategory, searchQuery],
  );

  const itemMatchesFilters = (item: MenuItem) => {
    if (activeDietaryFilters.length > 0) {
      if (!activeDietaryFilters.every((tag) => item.dietary_tags?.includes(tag))) return false;
    }
    if (activeAllergenAvoid.length > 0) {
      if (activeAllergenAvoid.some((a) => item.allergens?.includes(a))) return false;
    }
    return true;
  };

  const hasActiveFilters = activeDietaryFilters.length > 0 || activeAllergenAvoid.length > 0;

  // Items are grouped under category headings rather than shown as one flat
  // list. With a category chip selected, filteredItems is already narrowed to
  // that category, so this collapses to a single section.
  const sections = useMemo(
    () => groupItemsByCategory(filteredItems, categories),
    [filteredItems, categories],
  );

  // Only short-circuit when the menu is genuinely empty — an empty *search*
  // result must keep the search box on screen so the diner can clear it.
  if (filteredItems.length === 0 && !searchQuery) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-8rem)] px-6">
        <p className="text-muted-foreground">No items available</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col relative overflow-hidden"
      style={{ height: "calc(100dvh - 4rem - env(safe-area-inset-top))" }}
    >
      {sessionMode === "group" && (
        <div className="h-1 w-full bg-primary shrink-0" aria-hidden />
      )}
      {tableNumber && (
        <div className="flex items-center justify-center gap-2 py-2 px-4 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold border border-primary/20">
            Table {tableNumber}
          </span>
        </div>
      )}
      {/* Menu search — names and descriptions */}
      <div className="px-4 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the menu…"
            aria-label="Search the menu"
            className="w-full h-9 rounded-full bg-card border border-border pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!searchQuery && (
        <CategoryChips
          categories={categories}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
      )}

      {/* Allergen avoidance row (auto-applied from VYNU ID profile) */}
      {activeAllergenAvoid.length > 0 && (
        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Avoiding
            </span>
            {activeAllergenAvoid.map((a) => (
              <button
                key={a}
                onClick={() =>
                  setActiveAllergenAvoid((prev) => prev.filter((x) => x !== a))
                }
                className="px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                title="Remove this allergen filter"
              >
                {a} ✕
              </button>
            ))}
            {allergensFromProfile && (
              <span className="text-[10px] text-muted-foreground italic">
                from your VYNU ID
              </span>
            )}
            <button
              onClick={() => {
                setActiveAllergenAvoid([]);
                setAllergensFromProfile(false);
              }}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Dietary filter row */}
      {allDietaryTags.length > 0 && (
        <ScrollArea className="w-full px-4 pb-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
            {allDietaryTags.map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setActiveDietaryFilters((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors border",
                  activeDietaryFilters.includes(tag)
                    ? "bg-secondary text-secondary-foreground border-secondary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground",
                )}
              >
                <Leaf className="h-2.5 w-2.5 inline mr-0.5" />
                {tag}
              </button>
            ))}
            {activeDietaryFilters.length > 0 && (
              <button
                onClick={() => setActiveDietaryFilters([])}
                className="px-2 py-1 rounded-full text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-24">
        {searchQuery && filteredItems.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
            <p className="text-muted-foreground text-sm">
              Nothing on the menu matches "{search.trim()}".
            </p>
            <button
              onClick={() => setSearch("")}
              className="px-4 py-1.5 rounded-full text-xs font-medium bg-card border border-border text-foreground hover:bg-accent"
            >
              Clear search
            </button>
          </div>
        )}
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`menu-section-${section.id}`}>
            {/* Sticky so the diner can always see which category they are in
                while scrolling a long menu. */}
            <h2
              id={`menu-section-${section.id}`}
              className="sticky top-0 z-10 -mx-3 px-4 py-2 bg-background/95 backdrop-blur-sm text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/50"
            >
              {section.name}
            </h2>
            <div className="space-y-2 py-2">
              {section.items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  onSelect={() => onItemSelect(item)}
                  dimmed={hasActiveFilters && !itemMatchesFilters(item)}
                  pricingIndex={pricingIndex}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default MenuFeed;
