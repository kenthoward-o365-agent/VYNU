import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateTaxes, type TaxConfig } from "@/lib/tax-utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, CheckCircle2 } from "lucide-react";

interface OrderItemModifier {
  modifier_id?: string;
  category_id?: string;
  name: string;
  price: number;
  type: "addon" | "removal" | "choice";
}

interface OrderItem {
  id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  menu_item_name?: string;
  modifiers?: OrderItemModifier[] | null;
}

interface VenueInfo {
  name: string;
  address: string | null;
  city: string | null;
  state?: string | null;
  postcode?: string | null;
  phone: string | null;
  email: string | null;
}

interface DinerInfo {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface ReceiptViewProps {
  orderId: string;
  total: number;
  createdAt: string;
  venueId: string;
  tableNumber: string;
  venue: VenueInfo;
  diner: DinerInfo | null;
}

const ReceiptView = ({
  orderId,
  total,
  createdAt,
  venueId,
  tableNumber,
  venue,
  diner,
}: ReceiptViewProps) => {
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [itemsRes, taxesRes] = await Promise.all([
        supabase
          .from("order_items")
          .select("id, menu_item_id, quantity, unit_price, modifiers")
          .eq("order_id", orderId),
        supabase
          .from("venue_taxes")
          .select("id, name, rate, tax_type, is_inclusive, display_order")
          .eq("venue_id", venueId)
          .eq("is_active", true)
          .order("display_order"),
      ]);

      let items: OrderItem[] = (itemsRes.data as any[]) || [];

      // Fetch menu item names
      if (items.length > 0) {
        const menuItemIds = items.map((i) => i.menu_item_id);
        const { data: menuItems } = await supabase
          .from("menu_items")
          .select("id, name")
          .in("id", menuItemIds);

        const nameMap = new Map((menuItems || []).map((m: any) => [m.id, m.name]));
        items = items.map((i) => ({ ...i, menu_item_name: nameMap.get(i.menu_item_id) || "Item" }));
      }

      setOrderItems(items);
      setTaxes((taxesRes.data as any as TaxConfig[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [orderId, venueId]);

  const taxResult = calculateTaxes(total, taxes);
  const orderDate = new Date(createdAt);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-muted-foreground text-sm">Loading receipt...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24" id="receipt-container">
      <div className="receipt-content bg-card rounded-2xl border border-border overflow-hidden max-w-md mx-auto">
        {/* Success header */}
        <div className="bg-primary/10 px-5 py-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-1" />
          <h2 className="text-lg font-bold text-foreground">Payment Successful</h2>
          <p className="text-xs text-muted-foreground">Thank you for your order</p>
        </div>

        {/* Tax Invoice header */}
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Tax Invoice &amp; Receipt
          </h3>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Venue</span>
              <span className="font-medium text-right">{venue.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order date</span>
              <span className="font-medium">
                {orderDate.toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                {orderDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Table</span>
              <span className="font-medium">{tableNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order #</span>
              <span className="font-medium font-mono text-xs">{orderId.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Diner info */}
        {diner && (diner.first_name || diner.email) && (
          <>
            <Separator className="mx-5" />
            <div className="px-5 py-3 space-y-1 text-sm">
              {(diner.first_name || diner.last_name) && (
                <p className="font-medium">
                  {[diner.first_name, diner.last_name].filter(Boolean).join(" ")}
                </p>
              )}
              {diner.email && (
                <p className="text-muted-foreground text-xs">{diner.email}</p>
              )}
              {diner.phone && (
                <p className="text-muted-foreground text-xs">{diner.phone}</p>
              )}
            </div>
          </>
        )}

        {/* Order items */}
        <Separator className="mx-5" />
        <div className="px-5 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Your Order
          </h4>
          <div className="space-y-2">
            {orderItems.map((item) => {
              const paidMods = (item.modifiers || []).filter((m) => Number(m.price) > 0);
              const lineTotal =
                (Number(item.unit_price) + paidMods.reduce((s, m) => s + Number(m.price), 0)) *
                item.quantity;
              return (
                <div key={item.id} className="space-y-0.5">
                  <div className="flex justify-between text-sm">
                    <span>
                      {item.quantity}× {item.menu_item_name}
                    </span>
                    <span className="font-medium">${lineTotal.toFixed(2)}</span>
                  </div>
                  {paidMods.map((m, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-muted-foreground pl-4">
                      <span>+ {m.name}</span>
                      <span>+${(Number(m.price) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tax breakdown */}
        <Separator className="mx-5" />
        <div className="px-5 py-3 space-y-1.5">
          {taxResult.lines.map((line, i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground">
              <span>
                {line.name} ({line.is_inclusive ? "incl." : "added"})
              </span>
              <span>${line.amount.toFixed(2)}</span>
            </div>
          ))}
          {taxes.length > 0 && taxResult.lines.some((l) => l.is_inclusive) && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal (ex-tax)</span>
              <span>${taxResult.subtotalExTax.toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold pt-1">
            <span>Total Paid</span>
            <span>${taxResult.grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Venue contact */}
        {(venue.phone || venue.email) && (
          <>
            <Separator className="mx-5" />
            <div className="px-5 py-3 text-center text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Questions about your order?</p>
              {venue.phone && <p>Call {venue.phone}</p>}
              {venue.email && <p>Email {venue.email}</p>}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="bg-muted/50 px-5 py-3 text-center">
          <p className="text-[10px] text-muted-foreground">Powered by H&L OrderNow Pty Ltd</p>
        </div>
      </div>

      {/* Download button (hidden in print) */}
      <div className="mt-4 max-w-md mx-auto no-print">
        <Button
          onClick={handlePrint}
          variant="outline"
          className="w-full h-12 rounded-xl gap-2"
        >
          <Download className="h-4 w-4" />
          Download Receipt
        </Button>
      </div>
    </div>
  );
};

export default ReceiptView;
