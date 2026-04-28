import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ConsumerLayout from "@/components/consumer/ConsumerLayout";
import BottomNav from "@/components/consumer/BottomNav";
import VenueLanding from "@/components/consumer/VenueLanding";
import MenuFeed from "@/components/consumer/MenuFeed";
import CartPanel, { CartItem } from "@/components/consumer/CartPanel";
import CheckoutPanel from "@/components/consumer/CheckoutPanel";
import ItemDetailScreen, { type SelectedModifier, type MenuItemForDetail } from "@/components/consumer/ItemDetailScreen";
import AIChatOverlay from "@/components/consumer/AIChatOverlay";
import OrderStatus from "@/components/consumer/OrderStatus";
import ReceiptView from "@/components/consumer/ReceiptView";
import VenueDiscovery from "@/components/consumer/VenueDiscovery";
import DinerSignup from "@/components/consumer/DinerSignup";
import DinerProfile from "@/components/consumer/DinerProfile";
import UpsellPrompt, { UpsellSuggestion } from "@/components/consumer/UpsellPrompt";
import LoyaltyJoinPrompt from "@/components/consumer/LoyaltyJoinPrompt";
import ModeSwitchSheet from "@/components/consumer/ModeSwitchSheet";
import type { SessionMode } from "@/components/consumer/SessionModeChooser";
import { buildRuleIndex, resolvePrice, type RuleIndex } from "@/lib/pricing-utils";

interface VenueInfo {
  id: string;
  name: string;
  venue_type: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  landing_page_html: string | null;
  group_id: string | null;
}

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

interface ActiveOrder {
  id: string;
  status: "received" | "preparing" | "ready" | "served" | "paid" | "cancelled" | "refunded";
  total: number;
  created_at: string;
  extra_wait_minutes?: number;
}

const OPEN_ORDER_STATUSES: ActiveOrder["status"][] = ["received", "preparing", "ready"];

const ConsumerOrder = () => {
  const { venueId, tableId } = useParams<{ venueId: string; tableId: string }>();
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pricingIndex, setPricingIndex] = useState<RuleIndex | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [tab, setTab] = useState<"feed" | "chat" | "cart" | "profile">("feed");
  const [showChat, setShowChat] = useState(false);
  const [chatMode, setChatMode] = useState<string>("chat_optional");
  const [agentName, setAgentName] = useState<string>("Shyndig");
  const [agentIconUrl, setAgentIconUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedTableId, setResolvedTableId] = useState<string | null>(null);
  const [dinerId, setDinerId] = useState<string | null>(null);
  const [dinerInfo, setDinerInfo] = useState<{ first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null>(null);
  const [dinerAllergens, setDinerAllergens] = useState<string[]>([]);
  const [showOneTapLoyalty, setShowOneTapLoyalty] = useState(false);
  const [lastOrderItems, setLastOrderItems] = useState<{ id: string; name: string; quantity: number }[]>([]);
  const chatSessionIdRef = useRef<string | null>(null);

  // Upsell state
  const [upsellSuggestion, setUpsellSuggestion] = useState<UpsellSuggestion | null>(null);
  const [shownUpsells] = useState(() => new Set<string>());
  const [dismissedSuggestions] = useState(() => new Set<string>());
  const [upsellEnabled, setUpsellEnabled] = useState(true);
  const upsellConfigRef = useRef<any>(null);

  // Selected item for detail screen
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Session mode state (solo vs group)
  const sessionStorageKey = venueId && tableId ? `shyndig:session:${venueId}:${tableId}` : null;
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [groupDisplayName, setGroupDisplayName] = useState<string | null>(null);
  const [showModeSwitch, setShowModeSwitch] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    if (!sessionStorageKey) return;
    try {
      const raw = localStorage.getItem(sessionStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.mode === "solo" || parsed.mode === "group") setSessionMode(parsed.mode);
        if (parsed.sessionId) setJoinedSessionId(parsed.sessionId);
        if (parsed.displayName) setGroupDisplayName(parsed.displayName);
      }
    } catch {}
  }, [sessionStorageKey]);

  const persistMode = (mode: SessionMode | null, sessionId?: string | null, displayName?: string | null) => {
    if (!sessionStorageKey) return;
    if (mode === null) {
      localStorage.removeItem(sessionStorageKey);
      return;
    }
    localStorage.setItem(
      sessionStorageKey,
      JSON.stringify({ mode, sessionId: sessionId ?? null, displayName: displayName ?? null })
    );
  };

  const handleModeSelect = (mode: SessionMode, sessionId?: string, displayName?: string) => {
    setSessionMode(mode);
    setJoinedSessionId(sessionId ?? null);
    setGroupDisplayName(displayName ?? null);
    persistMode(mode, sessionId ?? null, displayName ?? null);
  };

  const handleSwitchMode = (mode: SessionMode) => {
    setSessionMode(mode);
    setJoinedSessionId(null);
    setGroupDisplayName(null);
    persistMode(mode, null, null);
    setShowModeSwitch(false);
  };

  // Fetch venue, table, and menu data
  useEffect(() => {
    const fetchData = async () => {
      if (!venueId || !tableId) return;

      const [venueRes, itemsRes, catsRes] = await Promise.all([
        supabase.from("venues").select("id, name, venue_type, logo_url, address, city, state, postcode, phone, email, landing_page_html, group_id").eq("id", venueId).single(),
        supabase.from("menu_items").select("*").eq("venue_id", venueId).eq("is_available", true).order("display_order"),
        supabase.from("menu_categories").select("id, name").eq("venue_id", venueId).eq("is_active", true).order("display_order"),
      ]);

      let tableRes = await supabase.from("tables").select("id, table_number").eq("id", tableId).eq("venue_id", venueId).maybeSingle();
      if (!tableRes.data) {
        tableRes = await supabase.from("tables").select("id, table_number").eq("table_number", tableId).eq("venue_id", venueId).maybeSingle();
      }

      if (venueRes.data) setVenue(venueRes.data);
      if (tableRes.data) {
        setTableNumber(tableRes.data.table_number);
        setResolvedTableId(tableRes.data.id);
      }
      if (itemsRes.data) setMenuItems(itemsRes.data as MenuItem[]);
      if (catsRes.data) setCategories(catsRes.data);

      // Load active pricing rules + their item assignments so the diner UI
      // can show the discounted price + rule label across menu / detail / cart.
      const { data: rulesData } = await supabase
        .from("pricing_rules")
        .select("*")
        .eq("venue_id", venueId)
        .eq("is_active", true);
      const rules = (rulesData || []) as any[];
      let links: { pricing_rule_id: string; menu_item_id: string }[] = [];
      if (rules.length > 0) {
        const { data: linkData } = await supabase
          .from("pricing_rule_items" as any)
          .select("pricing_rule_id, menu_item_id")
          .in("pricing_rule_id", rules.map((r) => r.id));
        links = (linkData || []) as any[];
      }
      setPricingIndex(buildRuleIndex(rules as any, links));

      // Load Shyndig AI chat mode
      const { data: aiConfig } = await supabase
        .from("venue_ai_config")
        .select("chat_mode, agent_name, agent_icon_url")
        .eq("venue_id", venueId)
        .maybeSingle();
      if (aiConfig?.chat_mode) setChatMode(aiConfig.chat_mode);
      if (aiConfig?.agent_name) setAgentName(aiConfig.agent_name);
      if (aiConfig?.agent_icon_url) setAgentIconUrl(aiConfig.agent_icon_url);

      // Load upsell config from venue settings
      if (venueRes.data) {
        const settings = (venueRes.data as any).settings as Record<string, any> | null;
        const upsell = settings?.upsell;
        upsellConfigRef.current = upsell;
        setUpsellEnabled(upsell?.enabled !== false);
      }

      setLoading(false);
    };

    fetchData();
  }, [venueId, tableId]);

  // Check for diner profile (Shyndig ID) — silently log visit + sync prefs
  useEffect(() => {
    const fetchDinerProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("diner_profiles")
          .select("id, first_name, last_name, email, phone, allergens")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (data) {
          setDinerId(data.id);
          setDinerInfo({ first_name: data.first_name, last_name: data.last_name, email: data.email, phone: data.phone });
          setDinerAllergens(data.allergens || []);
          setStarted(true);

          // Silent visit log for cross-venue recognition (one per page load)
          if (venueId) {
            const visitKey = `shyndig_visit_logged_${venueId}_${data.id}`;
            const today = new Date().toISOString().slice(0, 10);
            if (sessionStorage.getItem(visitKey) !== today) {
              await supabase
                .from("diner_visits")
                .insert({ diner_id: data.id, venue_id: venueId } as any);
              sessionStorage.setItem(visitKey, today);
            }

            // Trigger one-tap loyalty prompt if not already enrolled at this venue/group
            setShowOneTapLoyalty(true);

            // Fetch last order items for "another round"
            const { data: lastOrder } = await supabase
              .from("orders")
              .select("id")
              .eq("venue_id", venueId)
              .eq("customer_id", data.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (lastOrder) {
              const { data: items } = await supabase
                .from("order_items")
                .select("menu_item_id, quantity, menu_items(name)")
                .eq("order_id", lastOrder.id);

              if (items) {
                setLastOrderItems(items.map((oi: any) => ({
                  id: oi.menu_item_id,
                  name: oi.menu_items?.name || "Unknown",
                  quantity: oi.quantity,
                })));
              }
            }
          }
        }
      }
    };
    fetchDinerProfile();
  }, [started, showSignup, venueId]);

  useEffect(() => {
    const fetchOpenOrder = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !venueId) return;

      const customerFilters = [session.user.id, dinerId].filter(Boolean);
      if (customerFilters.length === 0) return;

      const { data: openOrder } = await supabase
        .from("orders")
        .select("id, status, total, created_at")
        .eq("venue_id", venueId)
        .or(customerFilters.map((id) => `customer_id.eq.${id}`).join(","))
        .in("status", OPEN_ORDER_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openOrder) {
        setActiveOrder({
          id: openOrder.id,
          status: openOrder.status,
          total: Number(openOrder.total) || 0,
          created_at: openOrder.created_at,
        });
      }
    };

    fetchOpenOrder();
  }, [venueId, showSignup, dinerId]);

  // Subscribe to order status changes
  useEffect(() => {
    if (!activeOrder) return;

    const channel = supabase
      .channel(`order-${activeOrder.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${activeOrder.id}`,
      }, (payload) => {
        setActiveOrder((prev) => prev ? { ...prev, ...(payload.new as any) } : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeOrder?.id]);

  const fetchUpsell = useCallback(async (item: { id: string; name: string; price: number }) => {
    if (!upsellEnabled || !venue || shownUpsells.has(item.id)) return;
    const cfg = upsellConfigRef.current;
    if (cfg && cfg.contextual_pairing === false) return;

    shownUpsells.add(item.id);
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
            added_item: item,
            menu_items: menuItems,
            venue_name: venue.name,
          }),
        }
      );
      const data = await resp.json();
      if (data.suggestions?.[0] && !dismissedSuggestions.has(data.suggestions[0].item_id)) {
        setUpsellSuggestion(data.suggestions[0]);
      }
    } catch (e) {
      console.error("Upsell fetch error:", e);
    }
  }, [upsellEnabled, venue, menuItems, shownUpsells, dismissedSuggestions]);

  /**
   * Build a stable cart-line key from {menu_item_id + sorted modifier ids + notes}.
   * Two adds with identical configuration merge into one line; differences split.
   */
  const buildLineKey = (
    menuItemId: string,
    modifiers: SelectedModifier[],
    notes: string,
  ) => {
    const sig = modifiers
      .map((m) => m.modifier_id)
      .sort()
      .join("|");
    return `${menuItemId}::${sig}::${notes}`;
  };

  const addConfiguredToCart = useCallback(
    (
      item: MenuItemForDetail,
      quantity: number,
      modifiers: SelectedModifier[],
      notes: string,
    ) => {
      const lineKey = buildLineKey(item.id, modifiers, notes);
      const resolved = resolvePrice(item.id, Number(item.price) || 0, pricingIndex);
      setCart((prev) => {
        const existing = prev.find((c) => c.id === lineKey);
        if (existing) {
          return prev.map((c) =>
            c.id === lineKey ? { ...c, quantity: c.quantity + quantity } : c,
          );
        }
        return [
          ...prev,
          {
            id: lineKey,
            menu_item_id: item.id,
            name: item.name,
            price: resolved.price,
            originalPrice: resolved.originalPrice,
            ruleName: resolved.ruleName,
            quantity,
            modifiers,
            notes,
          },
        ];
      });
      toast.success(`Added ${item.name}`, { duration: 1500 });
      fetchUpsell({ id: item.id, name: item.name, price: Number(item.price) || 0 });
    },
    [fetchUpsell, pricingIndex],
  );

  /** Quick-add (used by AI chat / upsell prompts) — no modifiers, no notes. */
  const addToCart = useCallback(
    (item: { id: string; name: string; price: number }) => {
      const menuItem = menuItems.find((m) => m.id === item.id);
      addConfiguredToCart(
        {
          id: item.id,
          name: item.name,
          description: menuItem?.description ?? null,
          price: item.price,
          image_url: menuItem?.image_url ?? null,
          dietary_tags: menuItem?.dietary_tags ?? null,
          allergens: menuItem?.allergens ?? null,
          is_available: menuItem?.is_available ?? true,
          category_id: menuItem?.category_id ?? null,
        },
        1,
        [],
        "",
      );
    },
    [menuItems, addConfiguredToCart],
  );

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) => c.id === id ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const handleOrderPlaced = (orderId: string) => {
    const cartTotal = cart.reduce((sum, item) => {
      const perUnit = item.price + item.modifiers.reduce((s, m) => s + (m.price || 0), 0);
      return sum + perUnit * item.quantity;
    }, 0);
    setActiveOrder({
      id: orderId,
      status: "received",
      total: cartTotal,
      created_at: new Date().toISOString(),
    });
    setCart([]);
    setShowCheckout(false);
    setTab("feed");

    // Mark the active chat session as converted
    if (chatSessionIdRef.current) {
      supabase
        .from("chat_sessions")
        .update({ converted_to_order: true })
        .eq("id", chatSessionIdRef.current)
        .then(({ error }) => {
          if (error) console.error("Failed to mark session as converted:", error);
        });
    }
  };

  const handleTabChange = (newTab: "feed" | "chat" | "cart" | "profile") => {
    if (newTab === "chat") {
      setShowChat(true);
    } else {
      setTab(newTab);
      if (newTab !== "cart") setShowCheckout(false);
    }
  };

  if (loading) {
    return (
      <ConsumerLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Loading...</h2>
          </div>
        </div>
      </ConsumerLayout>
    );
  }

  if (!venue) {
    return (
      <ConsumerLayout>
        <div className="flex items-center justify-center min-h-screen px-6 text-center">
          <div>
            <h2 className="text-lg font-semibold mb-2">Venue not found</h2>
            <p className="text-muted-foreground text-sm">This QR code may be invalid or expired.</p>
          </div>
        </div>
      </ConsumerLayout>
    );
  }

  if (showSignup && venue) {
    return (
      <ConsumerLayout>
        <DinerSignup
          venueId={venue.id}
          onComplete={() => { setShowSignup(false); setStarted(true); }}
          onBack={() => setShowSignup(false)}
          initialMode={authMode}
        />
      </ConsumerLayout>
    );
  }

  if (!started) {
    return (
      <ConsumerLayout>
        <VenueLanding
          venue={venue}
          tableNumber={tableNumber || "?"}
          tableId={resolvedTableId}
          sessionMode={sessionMode}
          onModeSelect={handleModeSelect}
          onStart={() => {
            setStarted(true);
            if (chatMode === "chat_first" || chatMode === "chat_only") {
              setShowChat(true);
            }
          }}
          onSignup={() => { setAuthMode("signup"); setShowSignup(true); }}
          onSignin={() => { setAuthMode("signin"); setShowSignup(true); }}
        />
      </ConsumerLayout>
    );
  }

  return (
    <ConsumerLayout>
      {/* Receipt view when paid */}
      {activeOrder && activeOrder.status === "paid" && venue && (
        <>
          <ReceiptView
            orderId={activeOrder.id}
            total={activeOrder.total}
            createdAt={activeOrder.created_at}
            venueId={venue.id}
            tableNumber={tableNumber || "?"}
            venue={venue}
            diner={dinerInfo}
          />
          <LoyaltyJoinPrompt
            venueId={venue.id}
            groupId={venue.group_id}
            show={!dinerId}
            onJoin={() => { setAuthMode("signup"); setShowSignup(true); }}
            onDismiss={() => {}}
          />
        </>
      )}

      {/* One-tap loyalty join for signed-in Shyndig ID holders (on session start, when no active/paid order is showing) */}
      {dinerId && venue && !activeOrder && (
        <LoyaltyJoinPrompt
          venueId={venue.id}
          groupId={venue.group_id}
          show={showOneTapLoyalty}
          dinerId={dinerId}
          onJoin={() => {}}
          onDismiss={() => setShowOneTapLoyalty(false)}
          onJoined={() => setShowOneTapLoyalty(false)}
        />
      )}

      {/* Active Order Status */}
      {activeOrder && OPEN_ORDER_STATUSES.includes(activeOrder.status) && activeOrder.status !== "refunded" && (
        <OrderStatus
          orderId={activeOrder.id}
          status={activeOrder.status as "received" | "preparing" | "ready" | "served" | "paid" | "cancelled"}
          total={activeOrder.total}
          createdAt={activeOrder.created_at}
          extraWaitMinutes={activeOrder.extra_wait_minutes ?? 0}
        />
      )}

      {/* Main Content */}
      {tab === "feed" && chatMode !== "chat_only" && (
        <MenuFeed
          items={menuItems}
          categories={categories}
          onItemSelect={(it) => setSelectedItem(it)}
          tableNumber={tableNumber || undefined}
          sessionMode={sessionMode ?? "solo"}
          pricingIndex={pricingIndex}
          defaultAllergens={dinerAllergens}
        />
      )}
      {tab === "feed" && chatMode === "chat_only" && !showChat && (
        <div className="flex-1 flex items-center justify-center px-6 text-center pb-20">
          <div>
            <p className="text-lg font-semibold mb-2">Chat with {venue?.name}'s AI server</p>
            <p className="text-sm text-muted-foreground mb-4">Tap the chat icon below to start ordering</p>
          </div>
        </div>
      )}
      {tab === "cart" && !showCheckout && (
        <CartPanel
          items={cart}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onPlaceOrder={() => setShowCheckout(true)}
          loading={false}
          venueId={venueId}
          venueName={venue?.name}
          menuItems={menuItems}
          dismissedSuggestions={dismissedSuggestions}
          onAddToCart={addToCart}
          onDismissSuggestion={(id) => dismissedSuggestions.add(id)}
          sessionMode={sessionMode ?? "solo"}
          groupDisplayName={groupDisplayName}
          onSwitchMode={cart.length === 0 ? () => setShowModeSwitch(true) : undefined}
        />
      )}
      {tab === "cart" && showCheckout && resolvedTableId && (
        <CheckoutPanel
          items={cart}
          venueId={venueId!}
          tableId={resolvedTableId}
          dinerId={dinerId}
          sessionMode={sessionMode ?? "solo"}
          joinedSessionId={joinedSessionId}
          groupDisplayName={groupDisplayName}
          onBack={() => setShowCheckout(false)}
          onOrderPlaced={handleOrderPlaced}
        />
      )}

      <ModeSwitchSheet
        open={showModeSwitch}
        currentMode={sessionMode ?? "solo"}
        hasItemsInCart={cart.length > 0}
        onOpenChange={setShowModeSwitch}
        onSwitch={handleSwitchMode}
      />

      {tab === "profile" && venue && (
        <DinerProfile venueId={venue.id} groupId={venue.group_id} />
      )}

      {/* Upsell Prompt Overlay */}
      {upsellSuggestion && (
        <UpsellPrompt
          suggestion={upsellSuggestion}
          onAdd={(item) => {
            addToCart(item);
            dismissedSuggestions.add(item.id);
            setUpsellSuggestion(null);
          }}
          onDismiss={() => {
            dismissedSuggestions.add(upsellSuggestion.item_id);
            setUpsellSuggestion(null);
          }}
        />
      )}

      {/* AI Chat Overlay */}
      {showChat && venueId && (
        <AIChatOverlay
          venueId={venueId}
          onClose={() => setShowChat(false)}
          onAddToCart={addToCart}
          menuItems={menuItems}
          dinerId={dinerId}
          tableId={resolvedTableId}
          lastOrderItems={lastOrderItems}
          cartTotal={cart.reduce((sum, c) => sum + c.price * c.quantity, 0)}
          onSessionCreated={(id) => { chatSessionIdRef.current = id; }}
        />
      )}

      <BottomNav
        active={tab}
        onNavigate={handleTabChange}
        cartCount={cart.reduce((sum, c) => sum + c.quantity, 0)}
        agentName={agentName}
        agentIconUrl={agentIconUrl}
      />

      {/* Item Detail overlay */}
      {selectedItem && venue && venueId && (
        <ItemDetailScreen
          item={selectedItem}
          venueId={venueId}
          venueName={venue.name}
          menuItems={menuItems}
          pricingIndex={pricingIndex}
          onClose={() => setSelectedItem(null)}
          onAdd={(it, qty, mods, notes) => {
            addConfiguredToCart(it, qty, mods, notes);
            setSelectedItem(null);
          }}
        />
      )}
    </ConsumerLayout>
  );
};

export default ConsumerOrder;
