import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Clock, ChefHat, CheckCircle, DollarSign } from "lucide-react";
import { toast } from "sonner";

type OrderStatus = "received" | "preparing" | "ready" | "served" | "paid" | "cancelled";

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  customer_notes: string | null;
  created_at: string;
  table_id: string | null;
}

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: any }> = {
  received: { label: "Received", color: "bg-blue-100 text-blue-800", icon: ClipboardList },
  preparing: { label: "Preparing", color: "bg-amber-100 text-amber-800", icon: ChefHat },
  ready: { label: "Ready", color: "bg-green-100 text-green-800", icon: CheckCircle },
  served: { label: "Served", color: "bg-purple-100 text-purple-800", icon: CheckCircle },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800", icon: DollarSign },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800", icon: Clock },
};

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  received: "preparing",
  preparing: "ready",
  ready: "served",
  served: "paid",
};

export default function Orders() {
  const { venue } = useVenue();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("active");

  const fetchOrders = async () => {
    if (!venue) return;
    let query = supabase.from("orders").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false });
    if (filter === "active") {
      query = query.in("status", ["received", "preparing", "ready"]);
    }
    const { data } = await query;
    setOrders((data as Order[]) || []);
  };

  useEffect(() => { fetchOrders(); }, [venue, filter]);

  // Realtime subscription
  useEffect(() => {
    if (!venue) return;
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venue.id}` }, () => {
        fetchOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venue, filter]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Order moved to ${statusConfig[newStatus].label}`);
    fetchOrders();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Orders</h2>
          <p className="text-muted-foreground">{orders.length} orders</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No orders yet</h3>
            <p className="text-muted-foreground">Orders will appear here when customers scan QR codes and place orders</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const config = statusConfig[order.status];
            const next = nextStatus[order.status];
            return (
              <Card key={order.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Order #{order.id.slice(0, 8)}</CardTitle>
                    <Badge className={config.color}>{config.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleTimeString()}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="font-semibold text-foreground">${Number(order.total).toFixed(2)}</span>
                  </div>
                  {order.customer_notes && (
                    <p className="text-sm text-muted-foreground italic">"{order.customer_notes}"</p>
                  )}
                  {next && (
                    <Button className="w-full" size="sm" onClick={() => updateStatus(order.id, next)}>
                      Move to {statusConfig[next].label}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
