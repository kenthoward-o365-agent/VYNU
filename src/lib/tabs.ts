// Shared helpers for open tabs ("run a tab, pay at the end").

export type TabPaymentMethod =
  | "card"
  | "apple_pay"
  | "google_pay"
  | "gift_card"
  | "voucher"
  | "cash"
  | "loyalty_points"
  | "other";

export const TAB_PAYMENT_METHOD_LABELS: Record<TabPaymentMethod, string> = {
  card: "Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  gift_card: "Gift card",
  voucher: "Voucher / comp",
  cash: "Cash",
  loyalty_points: "Loyalty points",
  other: "Other",
};

export interface TabZoneRules {
  zone: string | null;
  tabs_enabled: boolean;
  require_preauth: boolean;
  preauth_amount: number | null;
  max_tab_amount: number | null;
  allow_split_payments: boolean;
  open_tab_id: string | null;
  /** Resolved (zone with venue-default fallback) by get_table_tab_rules. */
  service_mode?: "table_delivery" | "counter_pickup" | null;
  pickup_location?: string | null;
  notify_sms_on_ready?: boolean;
  notify_inapp_on_ready?: boolean;
}

export interface TabSummaryPayment {
  id: string;
  method: TabPaymentMethod;
  amount: number;
  tip_amount: number;
  status: string;
  payer_label: string | null;
  reference_label: string | null;
  created_at: string;
}

export interface TabSummaryOrder {
  id: string;
  total: number;
  gratuity_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
}

export interface TabSummary {
  tab: {
    id: string;
    venue_id: string;
    table_id: string | null;
    zone: string | null;
    status: string;
    label: string | null;
    preauth_required: boolean;
    preauth_amount: number | null;
    preauth_status: string;
    max_tab_amount: number | null;
  };
  orders: TabSummaryOrder[];
  payments: TabSummaryPayment[];
  total_ordered: number;
  total_paid: number;
  balance_due: number;
}

export const money = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`;

/** Split `amount` into `parts` even shares, pushing rounding remainder onto the first share. */
export function splitEvenly(amount: number, parts: number): number[] {
  if (parts <= 1) return [Number(amount.toFixed(2))];
  const base = Math.floor((amount * 100) / parts) / 100;
  const shares = Array.from({ length: parts }, () => base);
  const remainder = Number((amount - base * parts).toFixed(2));
  shares[0] = Number((shares[0] + remainder).toFixed(2));
  return shares;
}
