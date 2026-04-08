import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ConsumerLayout from "@/components/consumer/ConsumerLayout";
import BottomNav from "@/components/consumer/BottomNav";
import VenueLanding from "@/components/consumer/VenueLanding";
import MenuFeed from "@/components/consumer/MenuFeed";
import CartPanel, { CartItem } from "@/components/consumer/CartPanel";
import CheckoutPanel from "@/components/consumer/CheckoutPanel";
import AIChatOverlay from "@/components/consumer/AIChatOverlay";
import OrderStatus from "@/components/consumer/OrderStatus";
import ReceiptView from "@/components/consumer/ReceiptView";
import VenueDiscovery from "@/components/consumer/VenueDiscovery";
import DinerSignup from "@/components/consumer/DinerSignup";
import DinerProfile from "@/components/consumer/DinerProfile";

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
  tax_id: string | null;
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
  status: "received" | "preparing" | "ready" | "served" | "paid" | "cancelled";
  total: number;
  created_at: string;
}

const OPEN_ORDER_STATUSES: ActiveOrder["status"][] = ["received", "preparing", "ready"];

const ConsumerOrder = () => {
  const { venueId, tableId } = useParams<{ venueId: string; tableId: string }>();
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [tab, setTab] = useState<"feed" | "chat" | "cart" | "profile">("feed");
  const [showChat, setShowChat] = useState(false);
  const [chatMode, setChatMode] = useState<string>("chat_optional");
  const [agentName, setAgentName] = useState<string>("Sippa");
  const [agentIconUrl, setAgentIconUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedTableId, setResolvedTableId] = useState<string | null>(null);
  const [dinerId, setDinerId] = useState<string | null>(null);
  const [dinerInfo, setDinerInfo] = useState<{ first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null>(null);
  const [lastOrderItems, setLastOrderItems] = useState<{ id: string; name: string; quantity: number }[]>([]);

  // Fetch venue, table, and menu data
  useEffect(() => {
    const fetchData = async () => {
      if (!venueId || !tableId) return;

      const [venueRes, itemsRes, catsRes] = await Promise.all([
        supabase.from("venues").select("id, name, venue_type, logo_url, address, city, state, postcode, phone, email, tax_id, landing_page_html, group_id").eq("id", venueId).single(),
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

      // Load Sippa AI chat mode
      const { data: aiConfig } = await supabase
        .from("venue_ai_config")
        .select("chat_mode, agent_name, agent_icon_url")
        .eq("venue_id", venueId)
        .maybeSingle();
      if (aiConfig?.chat_mode) setChatMode(aiConfig.chat_mode);
      if (aiConfig?.agent_name) setAgentName(aiConfig.agent_name);
      if (aiConfig?.agent_icon_url) setAgentIconUrl(aiConfig.agent_icon_url);

      setLoading(false);
    };

    fetchData();
  }, [venueId, tableId]);

  // Check for diner profile
  useEffect(() => {
    const fetchDinerProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("diner_profiles")
          .select("id, first_name, last_name, email, phone")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (data) {
          setDinerId(data.id);
          setDinerInfo({ first_name: data.first_name, last_name: data.last_name, email: data.email, phone: data.phone });

          // Fetch last order items for "another round"
          if (venueId) {
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
  }, [started, showSignup]);

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

  const addToCart = useCallback((item: { id: string; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
    toast.success(`Added ${item.name}`, { duration: 1500 });
  }, []);

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) => c.id === id ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const handleOrderPlaced = (orderId: string) => {
    setActiveOrder({
      id: orderId,
      status: "received",
      total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
      created_at: new Date().toISOString(),
    });
    setCart([]);
    setShowCheckout(false);
    setTab("feed");

    // Mark any active chat session as converted
    supabase
      .from("chat_sessions")
      .update({ converted_to_order: true })
      .eq("venue_id", venueId!)
      .eq("converted_to_order", false)
      .is("ended_at", null)
      .then(() => {});
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
        <ReceiptView
          orderId={activeOrder.id}
          total={activeOrder.total}
          createdAt={activeOrder.created_at}
          venueId={venue.id}
          tableNumber={tableNumber || "?"}
          venue={venue}
          diner={dinerInfo}
        />
      )}

      {/* Active Order Status */}
      {activeOrder && OPEN_ORDER_STATUSES.includes(activeOrder.status) && (
        <OrderStatus
          orderId={activeOrder.id}
          status={activeOrder.status}
          total={activeOrder.total}
          createdAt={activeOrder.created_at}
        />
      )}

      {/* Main Content */}
      {tab === "feed" && chatMode !== "chat_only" && (
        <MenuFeed items={menuItems} categories={categories} onAddToCart={addToCart} />
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
        />
      )}
      {tab === "cart" && showCheckout && resolvedTableId && (
        <CheckoutPanel
          items={cart}
          venueId={venueId!}
          tableId={resolvedTableId}
          dinerId={dinerId}
          onBack={() => setShowCheckout(false)}
          onOrderPlaced={handleOrderPlaced}
        />
      )}
      {tab === "profile" && venue && (
        <DinerProfile venueId={venue.id} groupId={venue.group_id} />
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
        />
      )}

      <BottomNav
        active={tab}
        onNavigate={handleTabChange}
        cartCount={cart.reduce((sum, c) => sum + c.quantity, 0)}
        agentName={agentName}
        agentIconUrl={agentIconUrl}
      />
    </ConsumerLayout>
  );
};

export default ConsumerOrder;
