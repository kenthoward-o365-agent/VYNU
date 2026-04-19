import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Clock, ChefHat, CheckCircle, DollarSign, ShoppingCart, XCircle, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import OrderAgeBadge from "@/components/orders/OrderAgeBadge";
import RefundDialog from "@/components/orders/RefundDialog";
import { usePermissions } from "@/hooks/use-permissions";

type OrderStatus = string;

const TERMINAL_STATUSES: OrderStatus[] = ["served", "paid", "cancelled", "refunded"];
const REFUNDABLE_STATUSES: OrderStatus[] = ["paid", "served", "cancelled"];
const FALLBACK_ACTIVE: OrderStatus[] = ["received", "preparing", "ready"];

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  menu_item: { name: string } | null;
}

interface RefundRow {
  id: string;
  order_id: string;
  amount: number;
  reason: string | null;
  created_at: string;
  status: string;
}

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  customer_notes: string | null;
  created_at: string;
  table_id: string | null;
  table: { table_number: string } | null;
  order_items: OrderItem[];
}

interface VenueStatus {
  id: string;
  name: string;
  label: string;
  color: string;
  display_order: number;
  is_terminal: boolean;
  is_active_display: boolean;
}

const fallbackStatusConfig: Record<string, { label: string; color: string }> = {
  received: { label: "Received", color: "bg-blue-100 text-blue-800" },
  preparing: { label: "Preparing", color: "bg-amber-100 text-amber-800" },
  ready: { label: "Ready", color: "bg-green-100 text-green-800" },
  served: { label: "Served", color: "bg-purple-100 text-purple-800" },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800" },
  refunded: { label: "Refunded", color: "bg-orange-100 text-orange-800" },
};

export default function Orders() {
  const { venue } = useVenue();
  const { canUpdateOrderStatus, canReopenAndRefund } = usePermissions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refundsByOrder, setRefundsByOrder] = useState<Record<string, RefundRow[]>>({});
  const [filter, setFilter] = useState<string>("active");
  const [auditDate, setAuditDate] = useState<DateRange>(getDefaultAuditDate);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [venueStatuses, setVenueStatuses] = useState<VenueStatus[]>([]);

  const statusByName = (name: string) => {
    const vs = venueStatuses.find((s) => s.name === name);
    if (vs) return { label: vs.label, color: "", vs };
    const fb = fallbackStatusConfig[name];
    return { label: fb?.label ?? name, color: fb?.color ?? "bg-muted text-foreground", vs: undefined as VenueStatus | undefined };
  };

  const fetchVenueStatuses = async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("venue_order_statuses")
      .select("id, name, label, color, display_order, is_terminal, is_active_display")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    setVenueStatuses((data as VenueStatus[]) || []);
  };

  const fetchOrders = async () => {
    if (!venue) return;
    let query = supabase
      .from("orders")
      .select("*, table:tables(table_number), order_items(id, quantity, unit_price, notes, menu_item:menu_items(name))")
      .eq("venue_id", venue.id)
      .gte("created_at", auditDate.from.toISOString())
      .lte("created_at", auditDate.to.toISOString())
      .order("created_at", { ascending: false });
    if (filter === "active") {
      const activeNames = venueStatuses.filter((s) => s.is_active_display).map((s) => s.name);
      const list = activeNames.length > 0 ? activeNames : FALLBACK_ACTIVE;
      query = query.in("status", list as any);
    }
    const { data } = await query;
    const list = (data as unknown as Order[]) || [];
    setOrders(list);

    if (list.length > 0) {
      const ids = list.map((o) => o.id);
      const { data: refundData } = await supabase
        .from("order_refunds")
        .select("id, order_id, amount, reason, created_at, status")
        .in("order_id", ids)
        .order("created_at", { ascending: false });
      const map: Record<string, RefundRow[]> = {};
      (refundData || []).forEach((r: any) => {
        (map[r.order_id] = map[r.order_id] || []).push(r);
      });
      setRefundsByOrder(map);
    } else {
      setRefundsByOrder({});
    }
  };

  useEffect(() => { fetchVenueStatuses(); }, [venue?.id]);
  useEffect(() => { fetchOrders(); }, [venue, filter, auditDate, venueStatuses]);

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
  }, [venue, filter, auditDate]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status: newStatus as any }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Order moved to ${statusByName(newStatus).label}`);
    fetchOrders();
  };

  const isToday = auditDate.label === "Today";

  // Summary stats
  const allOrders = orders;
  const activeCount = allOrders.filter((o) => ["received", "preparing", "ready"].includes(o.status)).length;
  const completedCount = allOrders.filter((o) => ["served", "paid"].includes(o.status)).length;
  const cancelledCount = allOrders.filter((o) => o.status === "cancelled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Orders</h2>
          <p className="text-muted-foreground">{venue?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <AuditDatePicker value={auditDate} onChange={setAuditDate} />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Order summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{allOrders.length}</div></CardContent>
        </Card>
        {isToday && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-foreground">{activeCount}</div></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{completedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{cancelledCount}</div></CardContent>
        </Card>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No orders</h3>
            <p className="text-muted-foreground">
              {filter === "active"
                ? "No active orders for this period. Try switching to 'All' to see completed orders."
                : "No orders found for the selected date range."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const config = statusConfig[order.status];
            const next = nextStatus[order.status];
            const refunds = refundsByOrder[order.id] || [];
            const totalRefunded = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
            const showRefundButton = canReopenAndRefund && REFUNDABLE_STATUSES.includes(order.status) && totalRefunded < Number(order.total);
            return (
              <Card key={order.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">#{order.id.slice(0, 8)}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleTimeString()}
                        {order.table?.table_number && ` · Table ${order.table.table_number}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={config.color}>{config.label}</Badge>
                      <OrderAgeBadge
                        createdAt={order.created_at}
                        frozen={TERMINAL_STATUSES.includes(order.status)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 flex-1">
                  {/* Order items list */}
                  <div className="divide-y divide-border">
                    {order.order_items?.map((item) => (
                      <div key={item.id} className="flex justify-between py-1.5 text-sm">
                        <div className="flex-1">
                          <span className="font-medium text-foreground">
                            {item.quantity}× {item.menu_item?.name ?? "Unknown item"}
                          </span>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">⤷ {item.notes}</p>
                          )}
                        </div>
                        <span className="text-muted-foreground ml-2">${(item.quantity * Number(item.unit_price)).toFixed(2)}</span>
                      </div>
                    ))}
                    {(!order.order_items || order.order_items.length === 0) && (
                      <p className="text-xs text-muted-foreground py-1">No items</p>
                    )}
                  </div>

                  {order.customer_notes && (
                    <p className="text-sm text-muted-foreground italic border-l-2 border-primary pl-2">"{order.customer_notes}"</p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                    <span className="font-bold text-foreground">${Number(order.total).toFixed(2)}</span>
                  </div>

                  {/* Refund summary */}
                  {refunds.length > 0 && (
                    <div className="rounded-md bg-muted/40 p-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Refunds ({refunds.length})</p>
                      {refunds.map((r) => (
                        <div key={r.id} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                          <span className="font-medium text-foreground">−${Number(r.amount).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-medium border-t border-border pt-1 mt-1">
                        <span>Total refunded</span>
                        <span>−${totalRefunded.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {next && canUpdateOrderStatus && (
                    <Button className="w-full" size="sm" onClick={() => updateStatus(order.id, next)}>
                      Move to {statusConfig[next].label}
                    </Button>
                  )}

                  {showRefundButton && (
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setRefundOrder(order)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Re-open & Refund
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {refundOrder && venue && (
        <RefundDialog
          open={!!refundOrder}
          onOpenChange={(o) => { if (!o) setRefundOrder(null); }}
          orderId={refundOrder.id}
          venueId={venue.id}
          orderTotal={Number(refundOrder.total)}
          alreadyRefunded={(refundsByOrder[refundOrder.id] || []).reduce((s, r) => s + Number(r.amount), 0)}
          onComplete={fetchOrders}
        />
      )}
    </div>
  );
}
