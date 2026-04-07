import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ConsumerLayout from "@/components/consumer/ConsumerLayout";
import BottomNav from "@/components/consumer/BottomNav";
import VenueLanding from "@/components/consumer/VenueLanding";
import MenuFeed from "@/components/consumer/MenuFeed";
import CartPanel, { CartItem } from "@/components/consumer/CartPanel";
import AIChatOverlay from "@/components/consumer/AIChatOverlay";
import OrderStatus from "@/components/consumer/OrderStatus";

interface VenueInfo {
  id: string;
  name: string;
  venue_type: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
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
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Fetch venue, table, and menu data
  useEffect(() => {
    const fetchData = async () => {
      if (!venueId || !tableId) return;

      const [venueRes, tableRes, itemsRes, catsRes] = await Promise.all([
        supabase.from("venues").select("id, name, venue_type, logo_url, address, city").eq("id", venueId).single(),
        supabase.from("tables").select("table_number").eq("id", tableId).single(),
        supabase.from("menu_items").select("*").eq("venue_id", venueId).eq("is_available", true).order("display_order"),
        supabase.from("menu_categories").select("id, name").eq("venue_id", venueId).eq("is_active", true).order("display_order"),
      ]);

      if (venueRes.data) setVenue(venueRes.data);
      if (tableRes.data) setTableNumber(tableRes.data.table_number);
      if (itemsRes.data) setMenuItems(itemsRes.data as MenuItem[]);
      if (catsRes.data) setCategories(catsRes.data);
      setLoading(false);
    };

    fetchData();
  }, [venueId, tableId]);

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

  const placeOrder = async () => {
    if (!venueId || !tableId || cart.length === 0) return;
    setPlacingOrder(true);

    try {
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          venue_id: venueId,
          table_id: tableId,
          total,
          status: "received",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      setActiveOrder({
        id: order.id,
        status: order.status as ActiveOrder["status"],
        total: order.total || total,
        created_at: order.created_at,
      });
      setCart([]);
      setTab("feed");
      toast.success("Order placed! 🎉");
    } catch (err: any) {
      console.error("Order error:", err);
      toast.error("Failed to place order. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleTabChange = (newTab: "feed" | "chat" | "cart" | "profile") => {
    if (newTab === "chat") {
      setShowChat(true);
    } else {
      setTab(newTab);
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

  if (!started) {
    return (
      <ConsumerLayout>
        <VenueLanding venue={venue} tableNumber={tableNumber || "?"} onStart={() => setStarted(true)} />
      </ConsumerLayout>
    );
  }

  return (
    <ConsumerLayout>
      {/* Active Order Status */}
      {activeOrder && activeOrder.status !== "paid" && activeOrder.status !== "cancelled" && (
        <OrderStatus
          orderId={activeOrder.id}
          status={activeOrder.status}
          total={activeOrder.total}
          createdAt={activeOrder.created_at}
        />
      )}

      {/* Main Content */}
      {tab === "feed" && (
        <MenuFeed items={menuItems} categories={categories} onAddToCart={addToCart} />
      )}
      {tab === "cart" && (
        <CartPanel
          items={cart}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onPlaceOrder={placeOrder}
          loading={placingOrder}
        />
      )}
      {tab === "profile" && (
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] px-6 text-center">
          <div>
            <h2 className="text-lg font-semibold mb-2">Profile</h2>
            <p className="text-muted-foreground text-sm">Sign in to save your preferences, track loyalty points, and reorder your favourites.</p>
          </div>
        </div>
      )}

      {/* AI Chat Overlay */}
      {showChat && venueId && (
        <AIChatOverlay
          venueId={venueId}
          onClose={() => setShowChat(false)}
          onAddToCart={addToCart}
          menuItems={menuItems}
        />
      )}

      <BottomNav
        active={tab}
        onNavigate={handleTabChange}
        cartCount={cart.reduce((sum, c) => sum + c.quantity, 0)}
      />
    </ConsumerLayout>
  );
};

export default ConsumerOrder;
