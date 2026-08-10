import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Minus, Plus, Flame, Leaf, AlertTriangle, Ban, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { optimizedImageUrl } from "@/lib/image-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { resolvePrice, type RuleIndex } from "@/lib/pricing-utils";

export interface SelectedModifier {
  modifier_id: string;
  category_id: string;
  name: string;
  price: number;
  type: "addon" | "removal" | "choice";
}

export interface MenuItemForDetail {
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

interface ModifierCategoryRow {
  id: string;
  name: string;
  display_order: number | null;
  selection_type: "addon" | "removal" | "choice";
  min_selection: number;
  max_selection: number;
  // per-item
  is_required: boolean;
  item_display_order: number;
}

interface ModifierRow {
  id: string;
  category_id: string;
  name: string;
  price: number;
  display_order: number | null;
  is_active: boolean | null;
}

interface UpsellSuggestion {
  item_id: string;
  name: string;
  reason?: string;
  price?: number;
}

interface Props {
  item: MenuItemForDetail;
  venueId: string;
  venueName: string;
  menuItems: MenuItemForDetail[];
  pricingIndex?: RuleIndex | null;
  /**
   * Whether the venue's package includes AI upsell (`ai.upsell`). When false the
   * contextual pairing suggestion is neither requested nor rendered.
   * Defaults to true so existing callers are unaffected.
   */
  showUpsell?: boolean;
  onClose: () => void;
  onAdd: (
    item: MenuItemForDetail,
    quantity: number,
    modifiers: SelectedModifier[],
    notes: string,
  ) => void;
}

const ItemDetailScreen = ({ item, venueId, venueName, menuItems, pricingIndex, showUpsell = true, onClose, onAdd }: Props) => {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [categories, setCategories] = useState<ModifierCategoryRow[]>([]);
  const [modifiers, setModifiers] = useState<ModifierRow[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectedModifier>>(new Map());
  const [loadingMods, setLoadingMods] = useState(true);
  const [upsell, setUpsell] = useState<UpsellSuggestion | null>(null);
  const [expandedOptional, setExpandedOptional] = useState<Set<string>>(new Set());

  const isAvailable = item.is_available ?? true;
  const resolved = resolvePrice(item.id, Number(item.price) || 0, pricingIndex ?? null);
  const effectiveBase = resolved.price;

  // Fetch modifier categories + modifiers attached to this item
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMods(true);
      const { data } = await (supabase as any).rpc("get_item_modifiers_public", {
        _venue_id: venueId,
        _menu_item_id: item.id,
      });

      const categoryRows = ((data as any)?.categories || []) as ModifierCategoryRow[];
      const modifierRows = ((data as any)?.modifiers || []) as ModifierRow[];

      if (categoryRows.length === 0) {
        if (!cancelled) {
          setCategories([]);
          setModifiers([]);
          setLoadingMods(false);
        }
        return;
      }

      if (cancelled) return;
      setCategories(categoryRows);
      setModifiers(modifierRows);
      setLoadingMods(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  // Fire upsell suggestion (contextual_pairing) once per open.
  // Skipped entirely when the venue's package excludes ai.upsell, so the
  // endpoint is not called at all rather than called and refused.
  useEffect(() => {
    if (!showUpsell) return;
    let cancelled = false;
    (async () => {
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
              trigger: "contextual_pairing",
              added_item: { id: item.id, name: item.name, price: item.price },
              menu_items: menuItems,
              venue_name: venueName,
            }),
          },
        );
        const data = await resp.json();
        if (!cancelled && data.suggestions?.[0]) {
          setUpsell(data.suggestions[0]);
        }
      } catch (e) {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, menuItems, venueName, showUpsell]);

  // Split into required (top, expanded) and optional (collapsed by default)
  const { requiredGroups, optionalGroups } = useMemo(() => {
    const groupFor = (cat: ModifierCategoryRow) => ({
      category: cat,
      mods: modifiers
        .filter((m) => m.category_id === cat.id)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    });
    const required = categories
      .filter((c) => c.is_required || (c.min_selection ?? 0) > 0)
      .sort((a, b) => (a.item_display_order ?? 0) - (b.item_display_order ?? 0))
      .map(groupFor)
      .filter((g) => g.mods.length > 0);
    const optional = categories
      .filter((c) => !(c.is_required || (c.min_selection ?? 0) > 0))
      .sort((a, b) => (a.item_display_order ?? 0) - (b.item_display_order ?? 0))
      .map(groupFor)
      .filter((g) => g.mods.length > 0);
    return { requiredGroups: required, optionalGroups: optional };
  }, [categories, modifiers]);

  const countSelectedInCategory = (catId: string) =>
    Array.from(selected.values()).filter((m) => m.category_id === catId).length;

  const toggleModifier = (cat: ModifierCategoryRow, mod: ModifierRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(mod.id)) {
        next.delete(mod.id);
        return next;
      }
      const currentCount = Array.from(next.values()).filter((m) => m.category_id === cat.id).length;
      if (cat.selection_type === "choice") {
        for (const [k, v] of next) {
          if (v.category_id === cat.id) next.delete(k);
        }
      } else if (cat.max_selection > 0 && currentCount >= cat.max_selection) {
        return prev;
      }
      next.set(mod.id, {
        modifier_id: mod.id,
        category_id: cat.id,
        name: mod.name,
        price: Number(mod.price) || 0,
        type: cat.selection_type,
      });
      return next;
    });
  };

  const toggleOptionalExpanded = (catId: string) => {
    setExpandedOptional((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Validation: required (per menu_item_modifiers.is_required) OR min_selection > 0
  const validation = useMemo(() => {
    for (const cat of categories) {
      const count = countSelectedInCategory(cat.id);
      const minRequired = Math.max(cat.min_selection || 0, cat.is_required ? 1 : 0);
      if (count < minRequired) {
        return { ok: false, hint: `Pick at least ${minRequired} from ${cat.name}` };
      }
    }
    return { ok: true, hint: "" };
  }, [categories, selected]);

  const modifiersDelta = Array.from(selected.values()).reduce((s, m) => s + (m.price || 0), 0);
  const lineTotal = (effectiveBase + modifiersDelta) * quantity;

  const handleAdd = () => {
    if (!validation.ok || !isAvailable) return;
    onAdd(item, quantity, Array.from(selected.values()), notes.trim());
  };

  const upsellItem = showUpsell && upsell ? menuItems.find((m) => m.id === upsell.item_id) : null;

  const renderModifierList = (category: ModifierCategoryRow, mods: ModifierRow[]) => {
    const count = countSelectedInCategory(category.id);
    const cap = category.max_selection;
    return (
      <div className="space-y-1.5">
        {mods.map((mod) => {
          const checked = selected.has(mod.id);
          const wouldExceed =
            !checked && category.selection_type !== "choice" && cap > 0 && count >= cap;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => toggleModifier(category, mod)}
              disabled={wouldExceed}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border p-3 transition-colors text-left",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
                wouldExceed && "opacity-40 cursor-not-allowed",
              )}
            >
              <div
                className={cn(
                  "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                  checked ? "border-primary bg-primary" : "border-muted-foreground/30",
                )}
              >
                {checked && (
                  <svg
                    className="h-3 w-3 text-primary-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span className="flex-1 text-sm font-medium">{mod.name}</span>
              {Number(mod.price) > 0 && (
                <span className="text-sm font-semibold text-primary">
                  +${Number(mod.price).toFixed(2)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Back to menu"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold truncate flex-1">{item.name}</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-32">
        {/* Hero image */}
        <div className="aspect-[4/3] sm:aspect-[16/9] bg-muted relative">
          {item.image_url ? (
            <img
              src={optimizedImageUrl(item.image_url, 800)}
              alt={item.name}
              className={cn("w-full h-full object-cover", !isAvailable && "grayscale opacity-50")}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20">
              <Flame className="h-16 w-16 text-primary/30" />
            </div>
          )}
          {!isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-background/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2">
                <Ban className="h-5 w-5 text-destructive" />
                <span className="text-sm font-semibold text-destructive">Unavailable</span>
              </div>
            </div>
          )}
        </div>

        {/* Title block */}
        <div className="px-5 pt-5 pb-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold leading-tight flex-1">{item.name}</h2>
            {resolved.hasOverride ? (
              <div className="flex flex-col items-end shrink-0">
                <span className="text-sm text-muted-foreground line-through leading-none">
                  ${resolved.originalPrice.toFixed(2)}
                </span>
                <span className="text-2xl font-bold text-primary leading-tight">
                  ${resolved.price.toFixed(2)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80 leading-tight">
                  {resolved.ruleName}
                </span>
              </div>
            ) : (
              <span className="text-2xl font-bold text-primary shrink-0">
                ${Number(item.price).toFixed(2)}
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
          )}
          {(item.dietary_tags?.length || item.allergens?.length) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {item.dietary_tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] gap-1">
                  <Leaf className="h-2.5 w-2.5" />
                  {tag}
                </Badge>
              ))}
              {item.allergens?.map((allergen) => (
                <Badge
                  key={allergen}
                  variant="outline"
                  className="text-[10px] gap-1 text-warning border-warning/30"
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {allergen}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <span className="text-sm font-semibold">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="text-base font-semibold w-6 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Required modifier groups (always expanded) */}
        {!loadingMods &&
          requiredGroups.map(({ category, mods }) => {
            const count = countSelectedInCategory(category.id);
            const minRequired = Math.max(category.min_selection || 0, category.is_required ? 1 : 0);
            const cap = category.max_selection;
            const subLabel =
              cap > 0 && minRequired > 0
                ? `min ${minRequired} · max ${cap}`
                : cap > 0
                  ? `max ${cap}`
                  : `min ${minRequired}`;
            return (
              <div key={category.id} className="px-5 pb-4">
                <div className="flex items-baseline justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-semibold truncate">{category.name}</h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 px-1.5 border-destructive/40 text-destructive bg-destructive/5"
                    >
                      Required
                    </Badge>
                  </div>
                  <span
                    className={cn(
                      "text-xs shrink-0",
                      count < minRequired ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {count}
                    {cap > 0 ? `/${cap}` : ""}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">
                  {subLabel}
                </p>
                {renderModifierList(category, mods)}
              </div>
            );
          })}

        {/* Optional modifier groups (collapsed by default; auto-expand if selected) */}
        {!loadingMods &&
          optionalGroups.map(({ category, mods }) => {
            const count = countSelectedInCategory(category.id);
            const cap = category.max_selection;
            const isExpanded = expandedOptional.has(category.id) || count > 0;
            const heading =
              category.selection_type === "removal"
                ? "No / Hold"
                : category.selection_type === "choice"
                  ? "Choose"
                  : "Add-ons";
            const summaryLabel = cap > 0 ? `max ${cap}` : heading;
            return (
              <div key={category.id} className="px-5 pb-3">
                <button
                  type="button"
                  onClick={() => toggleOptionalExpanded(category.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-3 transition-colors text-left",
                    isExpanded
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                  aria-expanded={isExpanded}
                >
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all",
                      count > 0
                        ? "bg-primary text-primary-foreground"
                        : isExpanded
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-foreground",
                    )}
                  >
                    {count > 0 ? (
                      <span className="text-xs font-semibold">
                        {count}
                        {cap > 0 ? `/${cap}` : ""}
                      </span>
                    ) : isExpanded ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{category.name}</p>
                    {!isExpanded && (
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">
                        {summaryLabel}
                      </p>
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="pt-2.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2 px-1">
                      {heading}
                      {cap > 0 ? ` · max ${cap}` : ""}
                    </p>
                    {renderModifierList(category, mods)}
                  </div>
                )}
              </div>
            );
          })}

        {/* Upsell */}
        {upsellItem && (
          <div className="px-5 pb-4 pt-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">You might also like</h3>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <div className="h-14 w-14 rounded-lg overflow-hidden bg-muted shrink-0">
                {upsellItem.image_url ? (
                  <img
                    src={optimizedImageUrl(upsellItem.image_url, 128)}
                    alt={upsellItem.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Flame className="h-5 w-5 text-primary/30" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{upsellItem.name}</p>
                {upsell?.reason && (
                  <p className="text-[11px] text-muted-foreground truncate">{upsell.reason}</p>
                )}
                <p className="text-xs text-primary font-semibold">
                  ${Number(upsellItem.price).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="px-5 pb-6">
          <label className="text-sm font-semibold block mb-2">Special requests</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the kitchen should know? (e.g. allergy, doneness)"
            rows={2}
            className="text-sm"
          />
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="border-t border-border bg-background px-5 py-3 pb-safe">
        {!validation.ok && (
          <p className="text-xs text-destructive text-center mb-2">{validation.hint}</p>
        )}
        <Button
          onClick={handleAdd}
          disabled={!validation.ok || !isAvailable}
          className="w-full h-14 rounded-2xl text-base"
        >
          {isAvailable
            ? `Add ${quantity} to Order — $${lineTotal.toFixed(2)}`
            : "Currently unavailable"}
        </Button>
      </div>
    </div>
  );
};

export default ItemDetailScreen;
