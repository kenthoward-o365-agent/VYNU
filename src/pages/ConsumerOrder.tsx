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
import { useMenuSnapshot } from "@/hooks/use-menu-snapshot";
import { useDinerSession } from "@/hooks/use-diner-session";
import IdleTimeoutModal from "@/components/consumer/IdleTimeoutModal";

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
const TERMINAL_ORDER_STATUSES = new Set<ActiveOrder["status"]>(["paid", "cancelled", "refunded"]);
const lastOrderKey = (venueId?: string, tableId?: string) =>
  `shyndig.lastOrder.${venueId || "_"}.${tableId || "_"}`;

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

  // Diner web session: idle timeout + cart abandonment tracking
  const dinerSession = useDinerSession({
    venueId,
    tableId: resolvedTableId,
    dinerId,
    sessionMode,
    idleMinutes: 10,
    graceSeconds: 60,
    onSessionEnd: () => {
      setCart([]);
      setShowCheckout(false);
      setStarted(false);
      setSessionMode(null);
      setJoinedSessionId(null);
      setGroupDisplayName(null);
      if (sessionStorageKey) localStorage.removeItem(sessionStorageKey);
      if (venueId && tableId) {
        try { localStorage.removeItem(lastOrderKey(venueId, tableId)); } catch {}
      }
      toast("Your session ended due to inactivity.");
    },
  });
  // Replaces ~6 serial Supabase round-trips with ONE CDN-cached HTTP call.
  const { data: snapshot, isLoading: snapshotLoading } = useMenuSnapshot(venueId, tableId);

  useEffect(() => {
    if (!snapshot) return;

    if (snapshot.venue) setVenue(snapshot.venue as VenueInfo);
    if (snapshot.table) {
      setTableNumber(snapshot.table.table_number);
      setResolvedTableId(snapshot.table.id);
    }
    setMenuItems(snapshot.items as MenuItem[]);
    setCategories(snapshot.categories as MenuCategory[]);
    setPricingIndex(buildRuleIndex(snapshot.pricing.rules as any, snapshot.pricing.links));

    if (snapshot.ai?.chat_mode) setChatMode(snapshot.ai.chat_mode);
    if (snapshot.ai?.agent_name) setAgentName(snapshot.ai.agent_name);
    if (snapshot.ai?.agent_icon_url) setAgentIconUrl(snapshot.ai.agent_icon_url);

    if (snapshot.venue) {
      const settings = (snapshot.venue as any).settings as Record<string, any> | null;
      const upsell = settings?.upsell;
      upsellConfigRef.current = upsell;
      setUpsellEnabled(upsell?.enabled !== false);
    }

    setLoading(false);
  }, [snapshot]);

  useEffect(() => {
    if (!snapshotLoading && !snapshot) setLoading(false);
  }, [snapshotLoading, snapshot]);

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
      if (!venueId) return;

      // 1) Guest recovery: hydrate via localStorage + safe RPC (works without auth).
      const storedId = typeof window !== "undefined"
        ? localStorage.getItem(lastOrderKey(venueId, tableId))
        : null;
      if (storedId) {
        const { data: rpcData } = await supabase.rpc("get_diner_order_status", { _order_id: storedId });
        const row = (rpcData as any)?.[0];
        if (row && !TERMINAL_ORDER_STATUSES.has(row.status)) {
          setActiveOrder({
            id: row.id,
            status: row.status,
            total: Number(row.total) || 0,
            created_at: row.created_at,
            extra_wait_minutes: row.extra_wait_minutes ?? 0,
          });
          return;
        }
        if (row && TERMINAL_ORDER_STATUSES.has(row.status)) {
          localStorage.removeItem(lastOrderKey(venueId, tableId));
        }
      }

      // 2) Signed-in diner: look up most recent open order via RLS.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

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
  }, [venueId, tableId, showSignup, dinerId]);

  // Subscribe to order status changes (realtime) + polling fallback for guests
  // and for cases where the websocket misses an event (mobile Safari background, etc.)
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

    // Polling fallback — RPC is RLS-safe and works for guests and signed-in diners.
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.rpc("get_diner_order_status", { _order_id: activeOrder.id });
        const row = (data as any)?.[0];
        if (row) {
          setActiveOrder((prev) => prev ? { ...prev, ...row, total: Number(row.total) || prev.total } : prev);
          if (TERMINAL_ORDER_STATUSES.has(row.status)) {
            if (venueId && tableId) localStorage.removeItem(lastOrderKey(venueId, tableId));
            return; // stop polling on terminal
          }
        }
      } catch (e) {
        // swallow — next tick will retry
      }
      attempt++;
      const delay = attempt < 24 ? 5000 : 15000; // ~2 min then back off
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, 5000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [activeOrder?.id, venueId, tableId]);

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
      const cents = Math.round((Number(item.price) || 0) * quantity * 100);
      dinerSession.markAddToCart(cents);
      fetchUpsell({ id: item.id, name: item.name, price: Number(item.price) || 0 });
    },
    [fetchUpsell, pricingIndex, dinerSession],
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
    if (venueId && tableId) {
      try { localStorage.setItem(lastOrderKey(venueId, tableId), orderId); } catch {}
    }
    setCart([]);
    setShowCheckout(false);
    setTab("feed");
    dinerSession.markOrderPlaced(orderId);

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

  useEffect(() => {
    if (showCheckout) dinerSession.markCheckout();
  }, [showCheckout, dinerSession]);

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

      <IdleTimeoutModal
        open={dinerSession.showIdleModal}
        secondsLeft={dinerSession.graceLeft}
        totalSeconds={60}
        onStay={dinerSession.stayActive}
        onEnd={dinerSession.endNow}
      />
    </ConsumerLayout>
  );
};

export default ConsumerOrder;
