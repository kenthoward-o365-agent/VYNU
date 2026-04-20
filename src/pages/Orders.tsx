import { useEffect, useMemo, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Clock, ChefHat, CheckCircle, DollarSign, ShoppingCart, XCircle, RotateCcw, Undo2, Monitor, Link2 } from "lucide-react";
import { toast } from "sonner";
import AuditDatePicker, { getDefaultAuditDate, type DateRange } from "@/components/AuditDatePicker";
import OrderAgeBadge from "@/components/orders/OrderAgeBadge";
import RefundDialog from "@/components/orders/RefundDialog";
import PairTerminalDialog from "@/components/orders/PairTerminalDialog";
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
  menu_item_id: string;
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

interface TerminalBinding {
  terminal_id: string;
  venue_id: string;
  terminal_name: string;
  is_active: boolean;
  area_ids: string[];
}

export default function Orders() {
  const { venue } = useVenue();
  const { canUpdateOrderStatus, canReopenAndRefund } = usePermissions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refundsByOrder, setRefundsByOrder] = useState<Record<string, RefundRow[]>>({});
  const [filter, setFilter] = useState<string>("active");
  const [auditDate, setAuditDate] = useState<DateRange>(getDefaultAuditDate);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [venueStatuses, setVenueStatuses] = useState<VenueStatus[]>([]);
  const [terminal, setTerminal] = useState<TerminalBinding | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [terminalOverride, setTerminalOverride] = useState(false);
  const [terminalAreaItemIds, setTerminalAreaItemIds] = useState<Set<string> | null>(null);

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
      .select("*, table:tables(table_number), order_items(id, quantity, unit_price, notes, menu_item_id, menu_item:menu_items(name))")
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

  // Load terminal binding from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem("ordrup_terminal_token");
    if (!token) { setTerminal(null); return; }
    (async () => {
      const { data, error } = await supabase.rpc("get_terminal_by_token" as any, { _token: token });
      if (error || !data || (Array.isArray(data) && !data.length)) {
        // Token invalid (revoked or terminal deleted) — clear it
        localStorage.removeItem("ordrup_terminal_token");
        setTerminal(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row.is_active || (venue && row.venue_id !== venue.id)) {
        setTerminal(null);
        return;
      }
      setTerminal(row as TerminalBinding);
    })();
  }, [venue?.id]);

  // Heartbeat while terminal page is open
  useEffect(() => {
    if (!terminal) return;
    const token = localStorage.getItem("ordrup_terminal_token");
    if (!token) return;
    const ping = () => { supabase.rpc("heartbeat_display_terminal" as any, { _token: token }); };
    ping();
    const i = setInterval(ping, 60000);
    return () => clearInterval(i);
  }, [terminal?.terminal_id]);

  // When terminal binding active, fetch the set of menu_item ids that route to its areas
  useEffect(() => {
    if (!terminal || terminalOverride || !terminal.area_ids.length) {
      setTerminalAreaItemIds(null);
      return;
    }
    (async () => {
      // items directly bound to areas
      const { data: itemRows } = await supabase
        .from("menu_item_display_areas")
        .select("menu_item_id")
        .in("display_area_id", terminal.area_ids);
      // categories bound to areas → all items in those categories
      const { data: catRows } = await supabase
        .from("menu_category_display_areas")
        .select("category_id")
        .in("display_area_id", terminal.area_ids);
      const catIds = (catRows || []).map((r: any) => r.category_id);
      let catItemIds: string[] = [];
      if (catIds.length) {
        const { data: itemsInCats } = await supabase
          .from("menu_items")
          .select("id")
          .in("category_id", catIds);
        catItemIds = (itemsInCats || []).map((r: any) => r.id);
      }
      const all = new Set<string>([
        ...((itemRows || []).map((r: any) => r.menu_item_id)),
        ...catItemIds,
      ]);
      setTerminalAreaItemIds(all);
    })();
  }, [terminal?.terminal_id, terminalOverride, JSON.stringify(terminal?.area_ids)]);

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

  const unpairThisBrowser = () => {
    localStorage.removeItem("ordrup_terminal_token");
    setTerminal(null);
    toast.success("This browser is no longer bound to a terminal");
  };

  // Filter orders by terminal area routing if applicable
  const visibleOrders = useMemo(() => {
    if (!terminal || terminalOverride || !terminalAreaItemIds) return orders;
    return orders.filter((o) =>
      (o.order_items || []).some((it) => terminalAreaItemIds.has((it as any).menu_item_id || (it.menu_item as any)?.id))
    );
  }, [orders, terminal, terminalOverride, terminalAreaItemIds]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status: newStatus as any }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Order moved to ${statusByName(newStatus).label}`);
    fetchOrders();
  };

  const isToday = auditDate.label === "Today";

  // Summary stats — based on what's actually visible
  const allOrders = visibleOrders;
  const activeCount = allOrders.filter((o) => ["received", "preparing", "ready"].includes(o.status)).length;
  const completedCount = allOrders.filter((o) => ["served", "paid"].includes(o.status)).length;
  const cancelledCount = allOrders.filter((o) => o.status === "cancelled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Orders</h2>
          <p className="text-muted-foreground">{venue?.name}</p>
          {terminal ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1.5">
                <Monitor className="h-3 w-3" />
                {terminal.terminal_name}
              </Badge>
              <button
                onClick={() => setTerminalOverride((v) => !v)}
                className="text-xs underline text-muted-foreground hover:text-foreground"
              >
                {terminalOverride ? "Filter to terminal areas" : "Show all (override)"}
              </button>
              <button
                onClick={unpairThisBrowser}
                className="text-xs underline text-muted-foreground hover:text-foreground"
              >
                Unpair this browser
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPairOpen(true)}
              className="text-xs inline-flex items-center gap-1 underline text-muted-foreground hover:text-foreground"
            >
              <Link2 className="h-3 w-3" />
              Pair this Terminal
            </button>
          )}
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

      {visibleOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No orders</h3>
            <p className="text-muted-foreground">
              {terminal && !terminalOverride
                ? `No orders routed to ${terminal.terminal_name} for this period.`
                : filter === "active"
                ? "No active orders for this period. Try switching to 'All' to see completed orders."
                : "No orders found for the selected date range."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {visibleOrders.map((order) => {
            const config = statusByName(order.status);
            const refunds = refundsByOrder[order.id] || [];
            const totalRefunded = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
            const showRefundButton = canReopenAndRefund && REFUNDABLE_STATUSES.includes(order.status) && totalRefunded < Number(order.total);
            const buttonStatuses = venueStatuses.slice(0, 5);
            const currentIdx = buttonStatuses.findIndex((s) => s.name === order.status);
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
                      {config.vs ? (
                        <Badge
                          style={{ backgroundColor: config.vs.color, color: "#fff" }}
                          className="border-transparent"
                        >
                          {config.label}
                        </Badge>
                      ) : (
                        <Badge className={config.color}>{config.label}</Badge>
                      )}
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

                  {/* Status button row (up to 5) */}
                  {canUpdateOrderStatus && buttonStatuses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {buttonStatuses.map((s, i) => {
                        const isCurrent = s.name === order.status;
                        const isPast = currentIdx >= 0 && i < currentIdx;
                        return (
                          <Button
                            key={s.id}
                            size="sm"
                            variant={isCurrent ? "default" : "outline"}
                            disabled={isCurrent}
                            onClick={() => updateStatus(order.id, s.name)}
                            className={`flex-1 min-w-[80px] ${isPast ? "opacity-60" : ""}`}
                            style={isCurrent ? { backgroundColor: s.color, borderColor: s.color, color: "#fff" } : undefined}
                            title={s.label}
                          >
                            <span className="truncate">{s.label}</span>
                          </Button>
                        );
                      })}
                    </div>
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
