// CoPilot Walkthrough registry
// A walkthrough is a sequence of steps that navigate the user through the app,
// highlighting a target element with a spotlight + tooltip ("Step 1 of N").

export interface WalkthroughStep {
  /** Optional route to navigate to before this step. */
  route?: string;
  /** CSS selector for the element to spotlight. Use [data-copilot-target="..."] where possible. */
  selector?: string;
  /** Step heading. */
  title: string;
  /** Step body. Plain text. */
  body: string;
  /** Optional placement hint for the tooltip. */
  placement?: "auto" | "right" | "left" | "top" | "bottom";
}

export interface Walkthrough {
  id: string;
  title: string;
  description: string;
  steps: WalkthroughStep[];
}

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: "add-menu-item",
    title: "Add a menu item",
    description: "How to add a new item to your menu.",
    steps: [
      { route: "/menu", selector: '[data-copilot-target="/menu"]', title: "Open Menu Builder", body: "Click Menu in the sidebar to open the Menu Builder." },
      { selector: '[data-copilot-target="add-item"]', title: "Add Item", body: "Click ‘Add Item’ to create a new menu item. Fill in name, price, category, and modifiers." },
      { selector: '[data-copilot-target="menu-categories"]', title: "Pick a category", body: "Select the right category so the item shows in the right section on the diner menu.", placement: "right" },
    ],
  },
  {
    id: "create-table-qr",
    title: "Create a table and print its QR sticker",
    description: "Adds a table and downloads the permanent QR PDF.",
    steps: [
      { route: "/tables", selector: '[data-copilot-target="/tables"]', title: "Open Tables", body: "Click Tables in the sidebar." },
      { selector: '[data-copilot-target="add-table"]', title: "Add a table", body: "Click ‘Add Table’ and set the table number / capacity." },
      { selector: '[data-copilot-target="download-qr"]', title: "Download QR PDF", body: "Print the QR sticker. Important: QR URLs are permanent — never reprint after edits." },
    ],
  },
  {
    id: "refund-order",
    title: "Refund an order",
    description: "Walk through the refund flow on the live orders board.",
    steps: [
      { route: "/orders", selector: '[data-copilot-target="/orders"]', title: "Open Orders", body: "Click Orders in the sidebar to see the live order board." },
      { selector: '[data-copilot-target="order-card"]', title: "Pick the order", body: "Click on the order you want to refund." },
      { selector: '[data-copilot-target="refund-button"]', title: "Refund", body: "Press Refund and confirm. The refund posts back to the original card via H&L Pay." },
    ],
  },
  {
    id: "view-revenue",
    title: "See today's revenue",
    description: "Where the live revenue numbers live.",
    steps: [
      { route: "/dashboard", selector: '[data-copilot-target="/dashboard"]', title: "Open Dashboard", body: "The Dashboard is your home screen with today's totals." },
      { selector: '[data-copilot-target="revenue-tile"]', title: "Revenue tile", body: "Today's revenue is the top-left tile. Hover for tax-inclusive breakdown." },
      { selector: '[data-copilot-target="hourly-chart"]', title: "Hourly chart", body: "Scroll down for the hourly revenue chart — handy to spot peak/quiet times." },
    ],
  },
  {
    id: "configure-payments",
    title: "Configure H&L Pay payments",
    description: "Set up payments, gratuities and surcharges.",
    steps: [
      { route: "/settings", selector: '[data-copilot-target="/settings"]', title: "Open Settings", body: "Settings is in the sidebar." },
      { selector: '[data-copilot-target="settings-payments"]', title: "Payments section", body: "Open the Payments tab to enable H&L Pay and add your account." },
      { selector: '[data-copilot-target="settings-gratuities"]', title: "Gratuities & surcharges", body: "Configure default tip suggestions, surcharges (weekend/public holiday) and GST handling." },
    ],
  },
  {
    id: "pos-integration",
    title: "Connect H&L Exceed POS",
    description: "Pair your POS so orders push automatically.",
    steps: [
      { route: "/settings", selector: '[data-copilot-target="/settings"]', title: "Open Settings", body: "Settings is in the sidebar." },
      { selector: '[data-copilot-target="settings-integrations"]', title: "Integrations", body: "Open the Integrations tab and choose H&L Exceed." },
      { selector: '[data-copilot-target="pos-credentials"]', title: "Enter POS credentials", body: "Paste your POS API URL + key. Hit Test Connection — green means you're live." },
    ],
  },
  {
    id: "open-knowledge-base",
    title: "Browse the Knowledge Base",
    description: "Where the full how-to library lives.",
    steps: [
      { route: "/knowledge-base", selector: '[data-copilot-target="/knowledge-base"]', title: "Knowledge Base", body: "The full library — search any topic. Bookmark for later." },
    ],
  },
];

export const WALKTHROUGH_INDEX = WALKTHROUGHS.map((w) => ({
  id: w.id,
  title: w.title,
  description: w.description,
  step_count: w.steps.length,
}));

export function getWalkthrough(id: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.id === id);
}

// Global event channel
export const COPILOT_WALKTHROUGH_EVENT = "copilot:start-walkthrough";

export function startWalkthrough(id: string) {
  window.dispatchEvent(new CustomEvent(COPILOT_WALKTHROUGH_EVENT, { detail: { id } }));
}
