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
    id: "create-zone",
    title: "Create a zone (Bar, Bistro, Rooftop)",
    description: "Add a trading zone, give it a menu, and set how diners pay in it.",
    steps: [
      { route: "/settings", selector: '[data-copilot-target="/settings"]', title: "Open Settings", body: "Settings is in the sidebar." },
      { title: "Open the Zones tile", body: "Zones is the tile at the bottom right of the settings hub. It replaced the old Open Tabs tile." },
      { title: "Add a zone", body: "Click Add Zone and name it exactly as your team says it on the floor — Public Bar, Bistro, Rooftop. Add a colour so it's easy to spot on the Tables board." },
      { title: "Assign a menu", body: "In the Menu section of the zone card, pick the one menu this zone serves. Several zones can share a menu, but a zone serves exactly one." },
      { title: "Set payment rules", body: "In the Payments section choose Pay on order or Run a tab, then set optional card pre-auth, pre-auth amount, tab limit and split payments." },
      { route: "/tables", selector: '[data-copilot-target="/tables"]', title: "Use it on tables", body: "On Tables the Zone field is now a dropdown of your zones. Assigning a zone never changes a table's QR URL — don't reprint stickers." },
    ],
  },
  {
    id: "add-menu",
    title: "Add a second menu for another outlet",
    description: "Create a menu and tie it to a zone in Menu Builder.",
    steps: [
      { route: "/menu", selector: '[data-copilot-target="/menu"]', title: "Open Menu Builder", body: "Click Menu in the sidebar." },
      { title: "Use the zone / menu switcher", body: "The switcher at the top of the page controls which menu you're editing. Everything below it — categories, items, images, modifiers, pricing — applies to the selected menu only." },
      { title: "Create or duplicate a menu", body: "Add a new menu, or duplicate an existing one to copy every category and item across — the quickest way to spin up a second outlet menu." },
      { title: "Set the menu schedule", body: "Give the menu active days plus a start and end time (e.g. Lunch 11:00–15:00). Item time frames still apply on top of this." },
      { title: "Attach it to a zone", body: "Back in Settings → Zones, set the zone's menu to your new menu. Diners scanning a table in that zone now get this menu." },
    ],
  },
  {
    id: "enable-tabs",
    title: "Let a zone run tabs and split the bill",
    description: "Turn on open tabs, pre-auth and split payments for one zone.",
    steps: [
      { route: "/settings", selector: '[data-copilot-target="/settings"]', title: "Open Settings", body: "Settings is in the sidebar." },
      { title: "Open Zones", body: "Zones is the tile at the bottom right. Open the zone you want to run tabs in (e.g. Bistro)." },
      { title: "Switch on tabs", body: "In the Payments section, choose Run a tab. Orders in this zone now accumulate against one tab per table." },
      { title: "Pre-auth and limits", body: "Optionally require a card pre-authorisation and set the hold amount, plus a maximum tab value that prompts the diner to settle." },
      { title: "Allow split payments", body: "Turn this on so a table can settle with several payments and mixed methods — card, wallet, gift card, voucher, cash or loyalty points." },
      { route: "/orders", selector: '[data-copilot-target="/orders"]', title: "Watch the Open Tabs panel", body: "Orders → Open Tabs lists every live tab with balance due and pre-auth status. Clear it before close." },
    ],
  },
  {
    id: "collect-at-counter",
    title: "Set up collect-at-counter and ready alerts",
    description: "Tell diners where to collect and text them when the food is ready.",
    steps: [
      { route: "/settings", selector: '[data-copilot-target="/settings"]', title: "Open Settings", body: "Settings is in the sidebar." },
      { title: "Open Zones & service", body: "Open the Zones & service tile. The card at the top holds your venue-wide defaults; the zone cards below can override them." },
      { title: "Choose the venue-wide service mode", body: "Pick 'Delivered to table' or 'Diner collects at the counter'. Every zone follows this unless you override it." },
      { title: "Name the collection point", body: "Type it exactly as a diner would look for it — Main bar, Kitchen window, Hostess station. It appears at checkout and on the order tracker." },
      { title: "Pick the alert channels", body: "Choose SMS, in-app alert, or both. When staff mark an order Ready the diner is notified straight away." },
      { title: "Override a single zone", body: "If one outlet differs (bistro delivers, rooftop collects), open that zone card, switch on the service override and set its own mode and collection point." },
      { route: "/orders", selector: '[data-copilot-target="/orders"]', title: "Fire the alert", body: "On the Orders board, moving an order to Ready sends the alert. Zones with table service are unaffected." },
    ],
  },
  {
    id: "surcharge-special-dates",
    title: "Surcharge a public holiday or event date",
    description: "Add custom date ranges to a surcharge.",
    steps: [
      { route: "/settings", selector: '[data-copilot-target="/settings"]', title: "Open Settings", body: "Settings is in the sidebar." },
      { selector: '[data-copilot-target="settings-payments"]', title: "Payments → Surcharges", body: "Open Payments and scroll to the Surcharges section." },
      { title: "Open the surcharge", body: "Open your weekend/public-holiday surcharge, or create a new one with a clear name — diners see this name on the bill." },
      { title: "Add a special date range", body: "Under Special dates click Add date range, set a start and end date (same date twice for a single day) and label it — Christmas Day, Melbourne Cup, Grand Prix." },
      { title: "Save", body: "The surcharge now applies automatically on those dates regardless of weekday. No one has to remember to switch it on." },
    ],
  },
  {
    id: "enable-pubplus",
    title: "Turn on Pub+ across a group",
    description: "Enable the group-wide Pub+ loyalty programme.",
    steps: [
      { route: "/group", title: "Open the Group dashboard", body: "Pub+ is switched on at the parent company, not per venue. Pick the parent company at the top." },
      { title: "Open the Pub+ tab", body: "Configure earn rate, tiers, benefits and the join copy diners see." },
      { title: "Activate", body: "Every child venue instantly inherits Pub+ as its active loyalty programme. Members and points are shared across all venues in the group." },
      { title: "Pub+ API (placeholder)", body: "Admin → Integrations → Pub+ holds the placeholder for the real ALH Pub+ API. Until credentials exist, all Pub+ activity stays inside VYNU." },
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
