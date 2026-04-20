import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  BookOpen, LayoutDashboard, UtensilsCrossed, Tag, QrCode, ClipboardList,
  TrendingUp, Users, Settings, BarChart3, ChevronRight, Rocket, Sparkles,
  SlidersHorizontal, Gift, Bot, CreditCard, Receipt, FileText, Menu, X, Monitor, Sliders
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  label: string;
  icon: any;
}

const tocItems: TocItem[] = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "ordrup-ai-analytics", label: "L.O.U. AI Analytics", icon: BarChart3 },
  { id: "menu-builder", label: "Menu Builder", icon: UtensilsCrossed },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "tables-qr", label: "Tables & QR", icon: QrCode },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "display-terminals", label: "Display Terminals", icon: Monitor },
  { id: "operational-throttling", label: "Operational Throttling", icon: Sliders },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
  { id: "diners", label: "Diners", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4 text-sm text-muted-foreground leading-relaxed">
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-medium text-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal list-inside space-y-1.5 pl-1">
      {steps.map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs flex gap-2">
      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

export default function KnowledgeBase() {
  const [tocOpen, setTocOpen] = useState(false);

  return (
    <div className="flex gap-6 max-w-7xl mx-auto relative">
      {/* Mobile TOC toggle */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50 lg:hidden shadow-lg"
        onClick={() => setTocOpen(!tocOpen)}
      >
        {tocOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* TOC sidebar */}
      <aside className={cn(
        "lg:sticky lg:top-0 lg:h-fit lg:w-56 lg:shrink-0 lg:block",
        "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border p-4 lg:p-0 lg:border-0 lg:bg-transparent lg:static transition-transform duration-200",
        tocOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground text-sm">Contents</span>
        </div>
        <nav className="space-y-0.5">
          {tocItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { scrollTo(item.id); setTocOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left"
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
              <ChevronRight className="h-3 w-3 ml-auto opacity-40" />
            </button>
          ))}
        </nav>
      </aside>

      {/* Overlay for mobile TOC */}
      {tocOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setTocOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 space-y-8 min-w-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Everything you need to set up and run your venue on OrdrUp.</p>
        </div>

        <Separator />

        {/* Getting Started */}
        <Section id="getting-started" title="Getting Started" icon={Rocket}>
          <SubSection title="Welcome to OrdrUp">
            <p>OrdrUp replaces traditional menus with an AI-powered ordering experience. Diners scan a QR code at their table, chat with your venue's AI assistant, and place orders — no app download required.</p>
          </SubSection>
          <SubSection title="First-Time Setup Checklist">
            <StepList steps={[
              "Complete your venue details (name, address, operating hours) in Settings → Details.",
              "Build your menu: create categories, add items with descriptions and prices.",
              "Use AI Import to upload an existing menu (PDF or photo) and auto-populate items.",
              "Set up your tables and generate QR codes in Tables & QR.",
              "Set up OrdrPay payments in Settings → Payments.",
              "Set up tax rules in Settings → Taxes.",
              "Customise your OrdrUp AI agent personality in Settings → OrdrUp AI.",
              "Print and place QR stickers on each table — you're live!",
            ]} />
          </SubSection>
          <Tip>QR codes are permanent — once printed, they never change. You can safely order stickers.</Tip>
        </Section>

        {/* Dashboard */}
        <Section id="dashboard" title="Dashboard" icon={LayoutDashboard}>
          <SubSection title="Understanding Your Metrics">
            <p>Your dashboard gives you a real-time snapshot of today's performance:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Revenue</strong> — Total sales for the selected period.</li>
              <li><strong>Orders</strong> — Number of completed orders.</li>
              <li><strong>Avg Ticket</strong> — Average order value.</li>
              <li><strong>Ticket Times</strong> — How long orders take from received to served.</li>
            </ul>
          </SubSection>
          <SubSection title="Charts & Insights">
            <p><strong>Revenue by Hour</strong> shows when your peak trading periods are. <strong>Table Utilisation</strong> highlights which tables generate the most revenue. <strong>Top Items</strong> shows your best sellers by quantity and revenue.</p>
          </SubSection>
          <Tip>Use the date picker in the top-right to compare different time periods.</Tip>
        </Section>

        {/* L.O.U. AI Analytics */}
        <Section id="ordrup-ai-analytics" title="L.O.U. AI Analytics" icon={BarChart3}>
          <SubSection title="What the AI Tracks">
            <p>L.O.U. AI Analytics shows you how diners interact with your AI assistant:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Chat Sessions</strong> — Total conversations started.</li>
              <li><strong>Conversion Rate</strong> — Percentage of chats that led to an order.</li>
              <li><strong>Items Added via AI</strong> — How many items the AI suggested that were added to cart.</li>
              <li><strong>Message Count</strong> — Average messages per session.</li>
            </ul>
          </SubSection>
          <SubSection title="Reading the Insights">
            <p>A high conversion rate means your AI personality and menu descriptions are working well. If diners are chatting a lot but not ordering, consider simplifying your menu descriptions or adjusting the AI's tone in Settings → OrdrUp AI.</p>
          </SubSection>
        </Section>

        {/* Menu Builder */}
        <Section id="menu-builder" title="Menu Builder" icon={UtensilsCrossed}>
          <SubSection title="Categories & Items">
            <StepList steps={[
              "Click 'Add Category' to create a section (e.g. Starters, Mains, Drinks).",
              "Within each category, click 'Add Item' to create menu items.",
              "Fill in the name, description, and price. Add allergens and dietary tags.",
              "Drag items to reorder them within a category.",
              "Toggle items on/off to temporarily hide them without deleting.",
            ]} />
          </SubSection>
          <SubSection title="AI Import">
            <p>Upload a photo or PDF of your existing menu. OrdrUp's AI will read it and create categories and items automatically. Review and adjust before saving.</p>
            <StepList steps={[
              "Go to Menu Builder → Settings → AI Features → Import.",
              "Upload your menu file (PDF, JPG, PNG).",
              "Review the AI-generated items and make corrections.",
              "Click 'Import All' to add them to your menu.",
            ]} />
          </SubSection>
          <SubSection title="Enhance & Generate Images">
            <p><strong>Enhance Images</strong> uses AI to improve the quality of your existing food photos — better lighting, colour, and composition.</p>
            <p><strong>Generate Images</strong> creates professional food photos from your item descriptions when you don't have photos available.</p>
          </SubSection>
          <SubSection title="Modifiers">
            <p>Modifiers let diners customise their orders (e.g. "Extra cheese", "No onion", "Medium rare").</p>
            <StepList steps={[
              "Go to Menu Builder → Settings → Modifiers.",
              "Create modifier categories (e.g. 'Cooking Temperature', 'Add-ons').",
              "Add individual modifiers with optional price adjustments.",
              "Assign modifier categories to menu items.",
            ]} />
          </SubSection>
          <Tip>The AI assistant automatically presents relevant modifiers to diners during conversation.</Tip>
        </Section>

        {/* Pricing */}
        <Section id="pricing" title="Pricing" icon={Tag}>
          <SubSection title="Dynamic Pricing Rules">
            <p>Create rules that automatically adjust menu prices based on time, day, or special events:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Happy Hour</strong> — Discount during specific time windows.</li>
              <li><strong>Late Night</strong> — Premium pricing for late-night service.</li>
              <li><strong>Special / Event</strong> — One-off pricing for events.</li>
              <li><strong>Weather</strong> — Adjust pricing based on conditions.</li>
            </ul>
          </SubSection>
          <SubSection title="Setting Up a Rule">
            <StepList steps={[
              "Click 'Add Pricing Rule'.",
              "Choose a rule type and give it a name.",
              "Set the percentage modifier (negative for discounts, positive for surcharges).",
              "Define days of the week and time ranges.",
              "Toggle the rule active/inactive as needed.",
            ]} />
          </SubSection>
          <Tip>Pricing rules stack — if multiple rules apply, all modifiers are combined.</Tip>
        </Section>

        {/* Tables & QR */}
        <Section id="tables-qr" title="Tables & QR" icon={QrCode}>
          <SubSection title="Creating Tables">
            <StepList steps={[
              "Click 'Add Table' and enter the table number.",
              "Optionally set a zone (e.g. 'Patio', 'Main Floor') and capacity.",
              "Repeat for all tables in your venue.",
            ]} />
          </SubSection>
          <SubSection title="QR Codes">
            <p>Each table gets a unique QR code. When scanned, it takes the diner directly to your venue's AI ordering experience for that specific table.</p>
            <StepList steps={[
              "Click the QR icon on any table row to view the code.",
              "Download or print the QR code.",
              "Place it on the table as a sticker or tent card.",
            ]} />
          </SubSection>
          <Tip>QR codes are permanent and tied to the table's unique ID. They never expire — print them once and they work forever.</Tip>
        </Section>

        {/* Orders */}
        <Section id="orders" title="Orders" icon={ClipboardList}>
          <SubSection title="Default Order Lifecycle">
            <p>New venues start with these statuses (you can rename, recolour, reorder, add, or remove them in Order Display System):</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li><strong>Received</strong> — Order placed by diner.</li>
              <li><strong>Preparing</strong> — Kitchen is working on it.</li>
              <li><strong>Ready</strong> — Food is ready for service.</li>
              <li><strong>Served</strong> — Delivered to the table.</li>
              <li><strong>Paid</strong> — Payment completed (terminal).</li>
              <li><strong>Cancelled</strong> — Order was cancelled (terminal).</li>
            </ol>
          </SubSection>
          <SubSection title="The Order Card — Status Buttons">
            <p>Each order card shows up to <strong>5 status buttons</strong> across the bottom, drawn from your venue's custom statuses (sorted by display order). One tap advances the order; the diner's mobile view updates instantly via realtime.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>The <strong>current</strong> status is highlighted in its configured colour.</li>
              <li>Earlier statuses are dimmed but still tappable — useful for correcting a misclick or stepping back.</li>
              <li>The button row only appears for users whose role has <strong>Update Order Status</strong> permission.</li>
              <li>If you define more than 5 statuses, only the first 5 (by display order) appear as buttons. The rest are reachable via Re-open & Refund.</li>
            </ul>
          </SubSection>
          <SubSection title="Active vs All filter">
            <p>The Active / All dropdown in the upper-right of the Orders page is driven by the <strong>"Show in Active filter"</strong> toggle on each status. Statuses with this toggle on appear in the <strong>Active</strong> view; everything else only shows under <strong>All</strong>.</p>
            <p>Defaults: Received, Preparing, and Ready are flagged Active. Toggle Served on too if servers should keep working it after delivery, or off so completed plates fall off the live board.</p>
          </SubSection>
          <SubSection title="Order Display System (status setup)">
            <p>Settings for statuses live under <strong>Orders → Order Display System</strong>. For each status you can configure:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Name & Label</strong> — internal name and the label shown on the card button.</li>
              <li><strong>Colour</strong> — used as the background of the highlighted current-status button.</li>
              <li><strong>Display Order</strong> — controls left-to-right button order on the card.</li>
              <li><strong>Show in Active filter</strong> — drives the Active/All dropdown.</li>
              <li><strong>Terminal</strong> — marks the status as a final state (e.g. Paid, Cancelled, Refunded). Terminal orders show the Re-open & Refund action instead of advancing further.</li>
              <li><strong>Default</strong> — the status applied to brand-new orders (typically Received).</li>
            </ul>
          </SubSection>
          <SubSection title="Re-open & Refund">
            <p>Orders in a terminal status (Paid, Cancelled, Refunded) show a <strong>Re-open & Refund</strong> button. This is gated by the role permission of the same name. The flow:</p>
            <StepList steps={[
              "Open the order card and click Re-open & Refund.",
              "Enter the refund amount (full or partial) and a reason.",
              "OrdrPay processes the refund against the original payment.",
              "The order is reopened back to a working status; the refund is logged on the card.",
              "If the cumulative refunds equal the order total, the order automatically flips to Refunded.",
            ]} />
          </SubSection>
          <SubSection title="Display Areas (kitchen/bar routing)">
            <p>Display Areas let you split the menu across multiple stations — e.g. Fry Side, Grill, Bar, Expo. Each menu category and each menu item can route to <strong>up to 3 areas</strong> simultaneously. Items inherit their category's areas by default; override on an item to send it to a different combination.</p>
            <p>This sets the foundation for per-station Kitchen Display screens (coming next) — a single order line can fan out to multiple station views (e.g. "Loaded Fries" appears on both Fry Side and Expo).</p>
          </SubSection>
          <Tip>The diner's mobile view subscribes to live updates — the moment you tap a status button, their phone reflects the new status within ~1 second.</Tip>
        </Section>

        {/* Display Terminals */}
        <Section id="display-terminals" title="Display Terminals" icon={Monitor}>
          <SubSection title="What is a Display Terminal?">
            <p>
              A <strong>Display Terminal</strong> is a specific physical device — a Mac mini wired to a kitchen TV, an iPad on the bar, an Intel NUC behind the expo screen — running OrdrUp in a browser at a fixed station. Once you "pair" a terminal, that browser only shows the orders routed to its assigned Display Areas, regardless of which staff member is signed in.
            </p>
            <p>It's important to keep three concepts separate in your head:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>User</strong> — a human with a login (Owner, Manager, Staff). Users can be signed into many devices at once.</li>
              <li><strong>Display Area</strong> — a logical routing target like Kitchen, Bar, or Expo. Each menu category and item routes to up to 3 areas.</li>
              <li><strong>Display Terminal</strong> — a specific browser on a specific physical device, bound to one or more Display Areas.</li>
            </ul>
            <pre className="font-mono text-xs bg-muted p-3 rounded leading-relaxed whitespace-pre overflow-x-auto">
{`Order placed
   │
   ▼
[Order items] ──route via──▶ [Display Areas]
                                   │
                                   ▼
                          [Display Terminals]
                          (the screens that
                           show this order)`}
            </pre>
          </SubSection>

          <SubSection title="Why we don't use the device's MAC address">
            <p>A common question: "Why can't OrdrUp just identify the kitchen iPad by its MAC address?"</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Modern browsers can't read MAC addresses — they're blocked by the OS privacy sandbox.</li>
              <li>Even native apps on macOS, iOS, Windows, and Android receive a randomised per-app identifier, not the real hardware MAC.</li>
              <li>So instead, OrdrUp issues a <strong>device token</strong> (a UUID) when you pair a terminal. The token is stored in that browser's <code>localStorage</code> and acts as the device's identity.</li>
            </ul>
            <p>Implications you should know:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Clearing the browser's site data un-pairs the terminal — you'll need to re-pair with a fresh code.</li>
              <li>Incognito / Private mode does NOT persist the binding between sessions — never run a station in incognito.</li>
              <li>Each browser profile is a separate potential terminal. Chrome and Safari on the same Mac count as two devices.</li>
            </ul>
          </SubSection>

          <SubSection title="First-time setup (manager)">
            <StepList steps={[
              "Create your Display Areas (Kitchen, Bar, Expo, etc.) in Order Display System → Display Areas.",
              "Assign Display Areas to your menu categories and items in Menu Builder. Items inherit category areas by default.",
              "Go to Order Display System → Display Terminals → click Add Terminal.",
              "Name it descriptively, e.g. \"Kitchen Mac mini — line cook station\".",
              "Pick the Display Areas this terminal should show (one or many).",
              "Save — copy the 6-character pairing code (e.g. K7-9F2). It's valid for 10 minutes.",
            ]} />
          </SubSection>

          <SubSection title="Pairing the physical device">
            <StepList steps={[
              "On the kitchen Mac mini (or whichever device), open Chrome / Safari / Edge and navigate to your OrdrUp URL.",
              "Sign in with any staff account that has Orders access.",
              "In the Orders page header click \"Pair this Terminal\".",
              "Enter the 6-character code → tap Pair.",
              "The page reloads — the header now shows a 🖥 badge with the terminal name and assigned areas, and only relevant orders appear.",
            ]} />
            <Tip>Once paired, signing out the user does NOT un-pair the device. The next staff member to sign in on that browser sees the same station view automatically.</Tip>
          </SubSection>

          <SubSection title="Day-to-day operation">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Heartbeat</strong> — every 60 seconds the terminal pings the cloud while Orders is open. The dashboard shows that terminal as <strong>● Online</strong>.</li>
              <li><strong>Going offline</strong> — if the tab is closed, sleeps, or loses internet, status flips to <strong>Offline</strong> after ~2 minutes. Other terminals keep working.</li>
              <li><strong>User changes</strong> — sign-out / sign-in does not affect the terminal binding. The browser stays bound until a manager unpairs it or the browser data is cleared.</li>
              <li><strong>"Show all (override)"</strong> — a small toggle next to the terminal badge lets a manager temporarily see the full unfiltered order list without un-pairing. Click it again to return to the filtered view.</li>
            </ul>
          </SubSection>

          <SubSection title="Managing terminals (manager actions)">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Rename</strong> — change the name at any time without disturbing the device.</li>
              <li><strong>Change assigned Display Areas</strong> — takes effect on the next page load on that terminal.</li>
              <li><strong>Regenerate pairing code</strong> — issues a new 10-minute code if the previous one expired before the device was paired.</li>
              <li><strong>Unpair / revoke</strong> — invalidates the device token immediately. Use this when a device is lost or stolen, when you swap hardware, or when you decommission a station. The browser falls back to the unpaired Orders view on next reload.</li>
              <li><strong>Deactivate</strong> — keeps the terminal configuration but stops it from receiving orders. Useful for a station that's temporarily out of service.</li>
              <li><strong>Delete</strong> — permanent removal. The device's token is invalidated and the configuration is gone.</li>
            </ul>
          </SubSection>

          <SubSection title="Multi-terminal patterns (worked examples)">
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li><strong>Small café</strong> — one terminal showing all areas. Functionally identical to no terminal binding, but you get "Online" monitoring and a clear record of which device is the order screen.</li>
              <li><strong>Pub with separate kitchen + bar</strong> — Kitchen terminal bound to the Kitchen area; Bar terminal bound to the Bar area. Food tickets and drink tickets fan out to the right station automatically.</li>
              <li><strong>Restaurant brigade</strong> — Fry Side terminal → Fry; Grill terminal → Grill; Expo terminal → all three (Fry + Grill + Cold) so the expediter sees everything coming together for the pass.</li>
              <li><strong>Front-of-house tablet</strong> — a roaming iPad bound to all areas with "Show all (override)" toggled on by default — servers use it to chase orders across the floor without needing the manager view.</li>
            </ul>
          </SubSection>

          <SubSection title="Troubleshooting">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Symptom</th>
                    <th className="text-left py-2 pr-3 font-medium">Cause</th>
                    <th className="text-left py-2 font-medium">Fix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2 pr-3">"Invalid pairing code"</td><td className="py-2 pr-3">Code expired (&gt;10 min) or already used</td><td className="py-2">Regenerate from the dashboard</td></tr>
                  <tr><td className="py-2 pr-3">Terminal shows Offline but screen is on</td><td className="py-2 pr-3">Browser tab in background or device asleep</td><td className="py-2">Bring tab to foreground; disable display sleep</td></tr>
                  <tr><td className="py-2 pr-3">Wrong orders appearing</td><td className="py-2 pr-3">Bound to the wrong Display Areas</td><td className="py-2">Edit terminal, fix areas, reload the device</td></tr>
                  <tr><td className="py-2 pr-3">Lost identity after browser update</td><td className="py-2 pr-3">localStorage was cleared</td><td className="py-2">Re-pair with a fresh code</td></tr>
                  <tr><td className="py-2 pr-3">Same device shows as two terminals</td><td className="py-2 pr-3">Used both Chrome and Safari on the same Mac</td><td className="py-2">Standardise on one browser per station</td></tr>
                  <tr><td className="py-2 pr-3">"Pair this Terminal" link missing</td><td className="py-2 pr-3">User's role lacks Orders nav permission</td><td className="py-2">Grant orders nav in the role permissions</td></tr>
                  <tr><td className="py-2 pr-3">No orders on a paired terminal</td><td className="py-2 pr-3">No items route to that terminal's areas</td><td className="py-2">Assign Display Areas to categories / items in Menu Builder</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Security">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Device tokens are venue-scoped — a token from Venue A cannot view Venue B's orders even if pasted in.</li>
              <li>Tokens never appear in URLs or logs and aren't visible in the dashboard.</li>
              <li>Unpair immediately if a device is lost, stolen, or moved off-site.</li>
              <li>The heartbeat lets you spot a critical station that's been offline for hours — a future enhancement will email an alert when it does.</li>
              <li>All pairing requires an authenticated venue staff session — codes alone don't grant access.</li>
            </ul>
          </SubSection>

          <SubSection title="Hardware recommendations">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Kitchen</strong> — Mac mini + 27" wall-mounted monitor in landscape, OR an iPad Pro 12.9" in a kitchen-grade splash-proof case.</li>
              <li><strong>Bar</strong> — iPad 10.9" in a counter mount with a charging cable run.</li>
              <li><strong>Expo / pass</strong> — a large TV (43"+) driven by an Intel NUC or Mac mini, browser launched in fullscreen kiosk mode.</li>
              <li><strong>For all stations</strong> — disable display sleep in the OS, set the browser to auto-launch on reboot, and bookmark the OrdrUp URL on the home screen.</li>
            </ul>
            <Tip>iPads in kitchens take a beating. Always pair a device with a code — never share the URL alone — and keep a printed list of active terminals near the manager's office for quick "is everything online?" checks.</Tip>
          </SubSection>
        </Section>

        {/* Operational Throttling */}
        <Section id="operational-throttling" title="Operational Throttling" icon={Sliders}>
          <SubSection title="What it does">
            <p>
              Operational Throttling protects each station (Kitchen, Bar, Expo, Take Away) from being flooded during a rush. Orders are still placed and charged immediately — but the moment they appear on the kitchen Display Terminal is paced to whatever the station can actually handle. The diner sees a realistic ETA up front.
            </p>
          </SubSection>

          <SubSection title="The four modes">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Open</strong> — orders flow straight through. Use during normal trade.</li>
              <li><strong>Auto</strong> — the system holds new orders back when the queue exceeds capacity and releases them at your configured rate (e.g. 5 orders per 10 minutes = one every 2 min). Open auto-flips to Auto when load spikes, and back to Open once the queue clears.</li>
              <li><strong>Block</strong> — manual hold (e.g. coffee machine breaks). Nothing releases until you unblock or the timeout (default 15 min) auto-reverts to Auto.</li>
              <li><strong>Test</strong> — logs queueing behaviour and shows diners the would-be ETA, but releases orders immediately. Lets you tune capacity safely.</li>
            </ul>
          </SubSection>

          <SubSection title="Tuning capacity">
            <p>For each station set <strong>Max orders</strong> and <strong>per minutes</strong>. A pizza oven that pumps out 6 pies per 10 min → 6 / 10. A two-person bar making cocktails → maybe 4 / 10. Watch the queue counter on the Throttling page during a real service to dial it in. Run Test mode for a week and review the queue history before going live in Auto.</p>
          </SubSection>

          <SubSection title="What the diner sees">
            <p>When their order is queued, the order screen shows a small "Kitchen is busy — extra ~12m wait" line under the time. The headline ETA is automatically extended so they're never surprised. You can disable the diner-facing message per station if you'd rather absorb the delay silently.</p>
          </SubSection>

          <SubSection title="Bumping a single order">
            <p>The "Bump next" button releases the oldest queued order immediately — useful for a VIP, a kids' meal, or a re-fire. The order is logged as <em>bumped</em> in the audit trail.</p>
            <Tip>Throttling lives at <strong>Orders → Operational Throttling</strong>. The status strip at the top of the Orders page shows each station's current mode and queue size at a glance.</Tip>
          </SubSection>
        </Section>

        {/* Analytics */}
        <Section id="analytics" title="Analytics" icon={TrendingUp}>
          <SubSection title="Revenue & Performance">
            <p>The Analytics page provides deeper insights beyond the dashboard:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Revenue trends over time (daily, weekly, monthly).</li>
              <li>Item-level performance — which items sell best.</li>
              <li>Category breakdowns.</li>
            </ul>
          </SubSection>
          <SubSection title="Filtering">
            <p>Use the date range picker to focus on specific periods. Compare weekdays vs weekends, or track the impact of menu changes and pricing rules.</p>
          </SubSection>
        </Section>

        {/* Diners */}
        <Section id="diners" title="Diners" icon={Users}>
          <SubSection title="Diner Directory">
            <p>View all diners who have interacted with your venue. See their visit history, loyalty status, and order frequency.</p>
          </SubSection>
          <SubSection title="Loyalty Tracking">
            <p>If you have a loyalty programme configured (Settings → Loyalty), diner profiles show their current tier, points balance, and visit count.</p>
          </SubSection>
          <SubSection title="Diner Preferences (Personalisation)">
            <p>Configure how returning diners are treated when they interact with your venue:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Personalised Welcome</strong> — Custom greeting based on loyalty tier with merge fields ({"{name}"}, {"{tier}"}, {"{visits}"}).</li>
              <li><strong>Predictive Dining</strong> — AI predicts what the diner wants based on time of day, weather, and party size.</li>
              <li><strong>Order Again</strong> — One-tap reorder from the diner's last 10 orders.</li>
              <li><strong>Gamification</strong> — Status badges, secret menu unlocks, early access dishes, and exploration trackers.</li>
            </ul>
            <p>Access these settings via Diners → Diner Preferences in the sidebar.</p>
          </SubSection>
        </Section>

        {/* Settings */}
        <Section id="settings" title="Settings" icon={Settings}>
          <SubSection title="Details">
            <p>Update your venue name, type, address, contact information, logo, and operating hours. This information is displayed to diners and used by the AI assistant.</p>
          </SubSection>
          <SubSection title="Users & Roles">
            <p>Permissions in OrdrUp work in <strong>two layers</strong>: a <em>role</em> controls which sidebar areas a user can see, and <em>per-user toggles</em> refine what they can actually do inside Orders.</p>

            <p className="font-semibold mt-3">Layer 1 — Roles (sidebar access)</p>
            <p>Each venue defines its own roles under <strong>Settings → Users → Roles</strong>. Three system roles are seeded automatically and cannot be deleted: <strong>Owner</strong>, <strong>Manager</strong>, and <strong>Staff</strong>. You can create additional roles like "Bar Staff", "Floor Lead", or "Kitchen Only".</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Sidebar visibility</strong> — tick which top-level nav items the role can see (Dashboard, Orders, Menu, Pricing, Diners, Loyalty, Analytics, etc.). Sub-items inherit their parent (e.g. Modifiers follows Menu, Order Display System follows Orders).</li>
              <li><strong>Manage Roles</strong> — who can edit roles and permissions.</li>
              <li><strong>Manage Settings</strong> — who can edit venue-wide settings (Details, Payments, Taxes, Loyalty, etc.).</li>
            </ul>

            <p className="font-semibold mt-3">Layer 2 — Per-user order action toggles</p>
            <p>When you edit a user under <strong>Settings → Users</strong>, if their role grants Orders access, three additional switches appear:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Update Order Status</strong> — show or hide the status buttons on each order card (Received → Preparing → Ready → …).</li>
              <li><strong>Re-open Closed Orders</strong> — show a <em>Re-open</em> button on closed orders (Paid / Served / Cancelled) that lets the user move it back to an active status. <strong>No money is moved.</strong></li>
              <li><strong>Process Refunds</strong> — show the <em>Re-open &amp; Refund</em> button that re-opens the order <em>and</em> processes a refund through OrdrPay.</li>
            </ul>

            <p className="mt-3"><strong>Worked examples:</strong></p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><em>Line cook</em> (role: Staff) — Update Status on, both re-open toggles off. Can advance orders through the kitchen workflow but can't touch closed orders.</li>
              <li><em>Shift supervisor</em> (role: Staff) — Update Status on, Re-open Closed Orders on, Process Refunds off. Can fix up mistakes (e.g. accidentally marked as Paid) without being able to issue money.</li>
              <li><em>Floor manager</em> (role: Manager) — all three on. Full Orders capability including refunds.</li>
            </ul>

            <p>Owners always have full access regardless of any per-user toggles. To assign a role and toggle order permissions, edit the user under <strong>Settings → Users</strong> and use the dialog.</p>
          </SubSection>
          <SubSection title="Loyalty">
            <p>Configure your loyalty programme:</p>
            <StepList steps={[
              "Choose a programme type: Points, Stamps, or Tier-based.",
              "Set the rules (e.g. 1 point per dollar spent, 10 stamps for a free item).",
              "Define tier thresholds if using tiered loyalty.",
              "Toggle the programme active when ready.",
            ]} />
          </SubSection>
          <SubSection title="OrdrUp AI">
            <p>Customise your AI dining assistant:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Agent Name</strong> — What your AI introduces itself as.</li>
              <li><strong>Tone</strong> — Casual, professional, or playful.</li>
              <li><strong>Opening Message</strong> — The first thing diners see.</li>
              <li><strong>Venue Context</strong> — Background info the AI uses to answer questions (e.g. "We're a modern Australian bistro, BYO wine").</li>
              <li><strong>Agent Icon</strong> — Custom avatar for the chat interface.</li>
            </ul>
          </SubSection>
          <SubSection title="Payments — OrdrPay">
            <p>OrdrPay is OrdrUp's built-in payments product. We act as your payment facilitator (PayFac) end-to-end — application, underwriting, merchant account setup, funding, fee collection, statements, and chargeback management — so you don't need a separate processor account or API keys.</p>
            <SubSection title="Onboarding flow">
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li><strong>Application</strong> — submit your venue and business details.</li>
                <li><strong>Underwriting</strong> — our risk team reviews your application (usually 1–3 business days).</li>
                <li><strong>Approval</strong> — once approved, your OrdrPay merchant ID is issued and Settings → Payments shows the "Approved" badge.</li>
                <li><strong>Funding</strong> — settled funds land in your nominated bank account on a daily rolling schedule.</li>
              </ol>
            </SubSection>
            <SubSection title="What you can configure">
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li><strong>Mode</strong> — Test or Live. Always run end-to-end in Test mode before flipping to Live.</li>
                <li><strong>Capture mode</strong> — Immediate (charge when the order is placed) or Manual (authorise now, capture later when the order is fulfilled).</li>
                <li><strong>Statement descriptor</strong> — what your diner sees on their bank statement (max 22 characters).</li>
                <li><strong>Country & default currency</strong> — used for new payments and wallet configuration.</li>
              </ul>
            </SubSection>
            <SubSection title="Wallets — Apple Pay & Google Pay">
              <p>Apple Pay and Google Pay are enabled automatically on your OrdrPay account, including domain verification. Diners on Safari (iPhone/Mac) see Apple Pay; diners on Chrome/Android see Google Pay. Anonymous guests can pay with their wallet too — no account or card entry required.</p>
            </SubSection>
            <Tip>Use the test card numbers shown in Settings → Payments to verify your full ordering and payment flow before going live.</Tip>
          </SubSection>
          <SubSection title="Taxes">
            <p>Configure tax rules for your venue:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Percentage</strong> — Standard tax rate (e.g. 10% GST).</li>
              <li><strong>Fixed</strong> — Flat fee per order.</li>
              <li><strong>Compound</strong> — Tax calculated on top of other taxes.</li>
              <li>Set whether taxes are inclusive (already in the price) or exclusive (added on top).</li>
            </ul>
          </SubSection>
          <SubSection title="Landing Page Editor">
            <p>Customise the public-facing page diners see when they scan your QR code. Add sections like a hero banner, about text, and featured items. Preview changes in real-time on a mobile frame before publishing.</p>
          </SubSection>
        </Section>

        <Separator />
        <p className="text-xs text-muted-foreground text-center pb-8">
          Need more help? Contact us at support@ordrup.com
        </p>
      </div>
    </div>
  );
}