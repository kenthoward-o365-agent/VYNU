import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  BookOpen, LayoutDashboard, UtensilsCrossed, Tag, QrCode, ClipboardList,
  TrendingUp, Users, Settings, BarChart3, ChevronRight, Rocket, Sparkles,
  SlidersHorizontal, Gift, Bot, CreditCard, Receipt, FileText, Menu, X, Monitor, Sliders, Plug
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
  { id: "shyndig-ai-analytics", label: "Spark AI Analytics", icon: BarChart3 },
  { id: "menu-builder", label: "Menu Builder", icon: UtensilsCrossed },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "tables-qr", label: "Tables & QR", icon: QrCode },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "display-terminals", label: "Display Terminals", icon: Monitor },
  { id: "operational-throttling", label: "Operational Throttling", icon: Sliders },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
  { id: "diners", label: "Diners", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "test-cards", label: "Test Cards", icon: CreditCard },
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
          <p className="text-sm text-muted-foreground">Everything you need to set up and run your venue on H&L OrderNOW.</p>
        </div>

        <Separator />

        {/* Getting Started */}
        <Section id="getting-started" title="Getting Started" icon={Rocket}>
          <SubSection title="Welcome to H&L OrderNOW">
            <p>H&L OrderNOW replaces traditional menus with an AI-powered ordering experience. Diners scan a QR code at their table, chat with your venue&apos;s AI assistant, and place orders — no app download required.</p>
          </SubSection>
          <SubSection title="First-Time Setup Checklist">
            <StepList steps={[
              "Complete your venue details (name, address, operating hours) in Settings → Details.",
              "Build your menu: create categories, add items with descriptions and prices.",
              "Use AI Import to upload an existing menu (PDF or photo) and auto-populate items.",
              "Set up your tables and generate QR codes in Tables &amp; QR.",
              "Set up H&L Pay payments in Settings → Payments.",
              "Set up tax rules in Settings → Taxes.",
              "Customise your H&L OrderNOW AI agent personality in Settings → H&L OrderNOW AI.",
              "Print and place QR stickers on each table — you're live!",
            ]} />
          </SubSection>
          <Tip>QR codes are permanent — once printed, they never change. You can safely order stickers.</Tip>
        </Section>

        {/* Dashboard */}
        <Section id="dashboard" title="Dashboard" icon={LayoutDashboard}>
          <SubSection title="Understanding Your Metrics">
            <p>Your dashboard gives you a real-time snapshot of today&apos;s performance:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Revenue</strong> — Total sales for the selected period.</li>
              <li><strong>Orders</strong> — Number of completed orders.</li>
              <li><strong>Avg Ticket</strong> — Average order value.</li>
              <li><strong>Ticket Times</strong> — How long orders take from received to served.</li>
            </ul>
          </SubSection>
          <SubSection title="Charts &amp; Insights">
            <p><strong>Revenue by Hour</strong> shows when your peak trading periods are. <strong>Table Utilisation</strong> highlights which tables generate the most revenue. <strong>Top Items</strong> shows your best sellers by quantity and revenue.</p>
          </SubSection>
          <Tip>Use the date picker in the top-right to compare different time periods.</Tip>
        </Section>

        {/* Spark AI Analytics */}
        <Section id="shyndig-ai-analytics" title="Spark AI Analytics" icon={BarChart3}>
          <SubSection title="What the AI Tracks">
            <p>Spark AI Analytics shows you how diners interact with your AI assistant:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Chat Sessions</strong> — Total conversations started.</li>
              <li><strong>Conversion Rate</strong> — Percentage of chats that led to an order.</li>
              <li><strong>Items Added via AI</strong> — How many items the AI suggested that were added to cart.</li>
              <li><strong>Message Count</strong> — Average messages per session.</li>
            </ul>
          </SubSection>
          <SubSection title="Reading the Insights">
            <p>A high conversion rate means your AI personality and menu descriptions are working well. If diners are chatting a lot but not ordering, consider simplifying your menu descriptions or adjusting the AI&apos;s tone in Settings → H&L OrderNOW AI.</p>
          </SubSection>
        </Section>

        {/* Menu Builder */}
        <Section id="menu-builder" title="Menu Builder" icon={UtensilsCrossed}>
          <SubSection title="Categories &amp; Items">
            <StepList steps={[
              "Click 'Add Category' to create a section (e.g. Starters, Mains, Drinks).",
              "Within each category, click 'Add Item' to create menu items.",
              "Fill in the name, description, and price. Add allergens and dietary tags.",
              "Drag items to reorder them within a category.",
              "Toggle items on/off to temporarily hide them without deleting.",
            ]} />
          </SubSection>
          <SubSection title="AI Import">
            <p>Upload a photo or PDF of your existing menu. H&L OrderNOW&apos;s AI will read it and create categories and items automatically. Review and adjust before saving.</p>
            <StepList steps={[
              "Go to Menu Builder → Settings → AI Features → Import.",
              "Upload your menu file (PDF, JPG, PNG).",
              "Review the AI-generated items and make corrections.",
              "Click 'Import All' to add them to your menu.",
            ]} />
          </SubSection>
          <SubSection title="Enhance &amp; Generate Images">
            <p><strong>Enhance Images</strong> uses AI to improve the quality of your existing food photos — better lighting, colour, and composition.</p>
            <p><strong>Generate Images</strong> creates professional food photos from your item descriptions when you don't have photos available.</p>
          </SubSection>
          <SubSection title="Modifiers">
            <p>Modifiers let diners customise their orders (e.g. &quot;Extra cheese&quot;, &quot;No onion&quot;, &quot;Medium rare&quot;).</p>
            <StepList steps={[
              "Go to Menu Builder → Settings → Modifiers.",
              "Create modifier categories (e.g. 'Cooking Temperature', 'Add-ons').",
              "Add individual modifiers with optional price adjustments.",
              "Assign modifier categories to menu items.",
            ]} />
          </SubSection>
          <SubSection title="Item Detail Flow &amp; Modifier Limits">
            <p>When a diner taps a menu item, a dedicated <strong>Item Detail screen</strong> opens with a larger image, quantity selector, modifier groups, AI upsell suggestions, and a sticky &quot;Add to Order&quot; button. After adding, they return to the menu feed.</p>
            <p>Each modifier category has three configurable settings (cog icon next to the category name):</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Selection type</strong> — <em>Add-on</em> (paid extras), <em>No/Hold</em> (free removals like &quot;no onion&quot;), or <em>Choice</em> (size, doneness).</li>
              <li><strong>Min selection</strong> — required minimum picks. Set to 1+ to make a category mandatory (the Add to Order button stays disabled until met).</li>
              <li><strong>Max selection</strong> — caps how many options a diner can pick. <code>0</code> means unlimited.</li>
            </ul>
            <p><strong>Receipt vs kitchen display:</strong> the kitchen / expo display shows <em>every</em> chosen modifier (including free ones like &quot;no onion&quot;, in red). The diner receipt shows <em>only</em> modifiers with a positive price — free notes are silently omitted to keep the bill clean.</p>
            <p><strong>Cart behaviour:</strong> two adds of &quot;Burger + Bacon + No onion&quot; merge into qty 2; &quot;Burger + Bacon&quot; and &quot;Burger + Avocado&quot; stay as separate lines so the kitchen sees them correctly.</p>
          </SubSection>
          <Tip>The AI assistant automatically presents relevant modifiers to diners during conversation. Existing categories default to &quot;Add-on&quot; type with no limits — nothing breaks for venues already using modifiers.</Tip>
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
        <Section id="tables-qr" title="Tables &amp; QR" icon={QrCode}>
          <SubSection title="Creating Tables">
            <StepList steps={[
              "Click 'Add Table' and enter the table number.",
              "Optionally set a zone (e.g. 'Patio', 'Main Floor') and capacity.",
              "Repeat for all tables in your venue.",
            ]} />
          </SubSection>
          <SubSection title="QR Codes">
            <p>Each table gets a unique QR code. When scanned, it takes the diner directly to your venue&apos;s AI ordering experience for that specific table.</p>
            <StepList steps={[
              "Click the QR icon on any table row to view the code.",
              "Download or print the QR code.",
              "Place it on the table as a sticker or tent card.",
            ]} />
          </SubSection>
          <Tip>QR codes are permanent and tied to the table&apos;s unique ID. They never expire — print them once and they work forever.</Tip>
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
            <p>Each order card shows up to <strong>5 status buttons</strong> across the bottom, drawn from your venue&apos;s custom statuses (sorted by display order). One tap advances the order; the diner&apos;s mobile view updates instantly via realtime.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>The <strong>current</strong> status is highlighted in its configured colour.</li>
              <li>Earlier statuses are dimmed but still tappable — useful for correcting a misclick or stepping back.</li>
              <li>The button row only appears for users whose role has <strong>Update Order Status</strong> permission.</li>
              <li>If you define more than 5 statuses, only the first 5 (by display order) appear as buttons. The rest are reachable via Re-open &amp; Refund.</li>
            </ul>
          </SubSection>
          <SubSection title="Active vs All filter">
            <p>The Active / All dropdown in the upper-right of the Orders page is driven by the <strong>&quot;Show in Active filter&quot;</strong> toggle on each status. Statuses with this toggle on appear in the <strong>Active</strong> view; everything else only shows under <strong>All</strong>.</p>
            <p>Defaults: Received, Preparing, and Ready are flagged Active. Toggle Served on too if servers should keep working it after delivery, or off so completed plates fall off the live board.</p>
          </SubSection>
          <SubSection title="Order Display System (status setup)">
            <p>Settings for statuses live under <strong>Orders → Order Display System</strong>. For each status you can configure:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Name &amp; Label</strong> — internal name and the label shown on the card button.</li>
              <li><strong>Colour</strong> — used as the background of the highlighted current-status button.</li>
              <li><strong>Display Order</strong> — controls left-to-right button order on the card.</li>
              <li><strong>Show in Active filter</strong> — drives the Active/All dropdown.</li>
              <li><strong>Terminal</strong> — marks the status as a final state (e.g. Paid, Cancelled, Refunded). Terminal orders show the Re-open &amp; Refund action instead of advancing further.</li>
              <li><strong>Default</strong> — the status applied to brand-new orders (typically Received).</li>
            </ul>
          </SubSection>
          <SubSection title="Re-open &amp; Refund">
            <p>On finished orders (terminal statuses), operators with permission see <strong>&quot;Re-open &amp; Refund&quot;</strong>. This:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Moves the order back to a working status (Selected → Re-opened).</li>
              <li>Processes a full or partial refund through H&L Pay.</li>
            </ol>
            <p>Use this workflow when a diner changes their mind after paying or something was wrong with the order. If you just need to move the order back in the kitchen flow without money changing hands, use the dimmed status button to step back to a non-terminal status.</p>
          </SubSection>
          <SubSection title="Order Status Log">
            <p>Every status change is logged with timestamp and staff member. View the full history on any order by clicking &quot;View History&quot; in the action menu.</p>
          </SubSection>

          <SubSection title="Order Throttling">
            <p><strong>Coming soon:</strong> per-station queue management that holds tickets until the kitchen/bar can actually take them — with diner-visible ETA updates.</p>
          </SubSection>
        </Section>

        {/* Display Terminals */}
        <Section id="display-terminals" title="Display Terminals" icon={Monitor}>
          <SubSection title="What they are">
            <p>Display Terminals are a lightweight way to show orders on any screen — kitchen, bar, expo, coffee station — without buying dedicated hardware or installing software. Any device with a browser can become a terminal in under a minute.</p>
            <p>Key point — these are <em>display</em> terminals, not <em>ordering</em> terminals. Diners cannot order from them. Staff cannot mark orders ready from them. They simply show the orders assigned to specific <strong>Display Areas</strong> in real time, so the right station sees what they need to make.</p>
          </SubSection>

          <SubSection title="How it works">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Venue staff create terminals in Orders → Display Terminals and bind each to one or more Display Areas.</li>
              <li>A unique pairing code is generated and shown.</li>
              <li>Staff open a browser on the target device (kitchen iPad, wall-mounted TV, old phone) and visit the pairing URL.</li>
              <li>Enter the code; the device pairs and immediately starts showing live orders.</li>
              <li>The device sends a heartbeat every 30 seconds so you can see which terminals are online.</li>
            </ul>
          </SubSection>

          <SubSection title="The pairing flow">
            <StepList steps={[
              "Go to Orders → Display Terminals and click 'Add Terminal'.",
              "Give it a name (e.g. 'Kitchen 1', 'Bar iPad').",
              "Select which Display Areas this terminal should show (Kitchen, Bar, etc.).",
              "A pairing code appears — write it down or show it on the device you're pairing.",
              "On the target device, open a browser and go to the pairing URL shown.",
              "Enter the code and tap Pair.",
              "The terminal immediately shows live orders for those areas.",
            ]} />
            <p>Codes expire after 10 minutes and can only be used once. If pairing fails, regenerate the code.</p>
          </SubSection>

          <SubSection title="Unpairing and re-pairing">
            <p>Click Unpair on any terminal row to immediately disconnect the device. The terminal will show an offline message and the device can be paired again with a fresh code if needed.</p>
            <p>Identity is stored in the browser&apos;s localStorage — if the browser is cleared, the terminal will need re-pairing.</p>
          </SubSection>

          <SubSection title="Troubleshooting">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="py-2 pr-3 pl-3 font-medium">Symptom</th>
                    <th className="py-2 pr-3 font-medium">Cause</th>
                    <th className="py-2 font-medium">Fix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2 pr-3">&quot;Invalid pairing code&quot;</td><td className="py-2 pr-3">Code expired (&gt;10 min) or already used</td><td className="py-2">Regenerate from the dashboard</td></tr>
                  <tr><td className="py-2 pr-3">Terminal shows Offline but screen is on</td><td className="py-2 pr-3">Browser tab in background or device asleep</td><td className="py-2">Bring tab to foreground; disable display sleep</td></tr>
                  <tr><td className="py-2 pr-3">Wrong orders appearing</td><td className="py-2 pr-3">Bound to the wrong Display Areas</td><td className="py-2">Edit terminal, fix areas, reload the device</td></tr>
                  <tr><td className="py-2 pr-3">Lost identity after browser update</td><td className="py-2 pr-3">localStorage was cleared</td><td className="py-2">Re-pair with a fresh code</td></tr>
                  <tr><td className="py-2 pr-3">Same device shows as two terminals</td><td className="py-2 pr-3">Used both Chrome and Safari on the same Mac</td><td className="py-2">Standardise on one browser per station</td></tr>
                  <tr><td className="py-2 pr-3">&quot;Pair this Terminal&quot; link missing</td><td className="py-2 pr-3">User&apos;s role lacks Orders nav permission</td><td className="py-2">Grant orders nav in the role permissions</td></tr>
                  <tr><td className="py-2 pr-3">No orders on a paired terminal</td><td className="py-2 pr-3">No items route to that terminal&apos;s areas</td><td className="py-2">Assign Display Areas to categories / items in Menu Builder</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Security">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Device tokens are venue-scoped — a token from Venue A cannot view Venue B&apos;s orders even if pasted in.</li>
              <li>Tokens never appear in URLs or logs and aren&apos;t visible in the dashboard.</li>
              <li>Unpair immediately if a device is lost, stolen, or moved off-site.</li>
              <li>The heartbeat lets you spot a critical station that&apos;s been offline for hours — a future enhancement will email an alert when it does.</li>
              <li>All pairing requires an authenticated venue staff session — codes alone don&apos;t grant access.</li>
            </ul>
          </SubSection>

          <SubSection title="Hardware recommendations">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Kitchen</strong> — Mac mini + 27&quot; wall-mounted monitor in landscape, OR an iPad Pro 12.9&quot; in a kitchen-grade splash-proof case.</li>
              <li><strong>Bar</strong> — iPad 10.9&quot; in a counter mount with a charging cable run.</li>
              <li><strong>Expo / pass</strong> — a large TV (43&quot;+) driven by an Intel NUC or Mac mini, browser launched in fullscreen kiosk mode.</li>
              <li><strong>For all stations</strong> — disable display sleep in the OS, set the browser to auto-launch on reboot, and bookmark the H&L OrderNOW URL on the home screen.</li>
            </ul>
            <Tip>iPads in kitchens take a beating. Always pair a device with a code — never share the URL alone — and keep a printed list of active terminals near the manager&apos;s office for quick &quot;is everything online?&quot; checks.</Tip>
          </SubSection>
        </Section>

        {/* Operational Throttling */}
        <Section id="operational-throttling" title="Operational Throttling" icon={Sliders}>
          <SubSection title="What it is">
            <p>
              Operational Throttling is per-station flood control. Every Display Area (Kitchen, Bar, Expo, Take Away, Coffee, Dessert, etc.) has its own queue with its own capacity settings and its own mode. When a rush hits, throttling holds new tickets back and releases them at a rate the station can actually keep up with — instead of dumping 25 dockets on the kitchen at once.
            </p>
            <p>
              The order is still <strong>placed and charged immediately</strong>. We do not delay the diner&apos;s checkout. What we delay is the moment the ticket appears on the kitchen&apos;s Display Terminal. The diner sees a realistic ETA up front (e.g. &quot;35 min&quot; instead of the usual 15) and the kitchen sees a steady, manageable flow of dockets.
            </p>
            <p>
              This is the equivalent of Chewzie&apos;s &quot;Smart Docket Queue&quot; but built on our existing Display Areas — no extra hardware, no per-printer config, just a setting on each station you&apos;ve already created.
            </p>
          </SubSection>

          <SubSection title="Where to find it">
            <p>
              <strong>Orders → Operational Throttling</strong> in the sidebar. The status strip at the top of the main Orders page also shows each station&apos;s current mode and queue size at a glance — click any station to jump to its config.
            </p>
            <p>
              Only users with <em>Manage Settings</em> permission can change throttle modes or capacity. Everyone else sees the status strip read-only.
            </p>
          </SubSection>

          <SubSection title="The four modes explained">
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li>
                <strong>Open</strong> (green) — orders flow straight through with no delay. This is the default and what every station sits in during normal trade. Throttling is effectively off.
              </li>
              <li>
                <strong>Auto</strong> (amber) — the system holds new tickets back when the queue exceeds your configured capacity and releases them at the rate you set. For example, &quot;5 orders per 10 minutes&quot; releases one ticket every 2 minutes regardless of how many are queued behind it. Auto is self-managing: <em>Open auto-flips to Auto</em> when the queue spikes past capacity, and <em>Auto auto-flips back to Open</em> once the queue is empty for 2+ minutes. You usually don't need to touch this — just leave the station in Auto as the standby mode.
              </li>
              <li>
                <strong>Block</strong> (red) — a hard manual hold. Nothing releases until you unblock or the configured timeout expires (default 15 minutes, then auto-reverts to Auto). Use this when something has actually broken: coffee machine down, fryer overheated, chef stepped away. Diners&apos; orders are still accepted and charged, but the ticket is held with an extended ETA.
              </li>
              <li>
                <strong>Test</strong> (blue) — observation mode. The system logs queue behaviour and shows diners the would-be extended ETA, but always releases the ticket immediately to the kitchen. Use this for a week or two before going live in Auto so you can tune capacity numbers against real service data without affecting the kitchen.
              </li>
            </ul>
          </SubSection>

          <SubSection title="How auto-flipping between Open and Auto works">
            <p>
              The throttle-tick background job runs every 30 seconds. For each station with throttling enabled it:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Counts orders currently queued (i.e. with <code>throttled_until</code> still in the future).</li>
              <li>If the station is in <strong>Open</strong> and queue size exceeds <em>Max orders</em> → flips to <strong>Auto</strong>.</li>
              <li>If the station is in <strong>Auto</strong> and the queue has been empty for ~2 min → flips back to <strong>Open</strong>.</li>
              <li>If the station is in <strong>Block</strong> and the block timeout has passed → flips to <strong>Auto</strong> (so the backlog releases at a controlled pace, not all at once).</li>
              <li>For stations in Auto, releases the next batch of tickets by clearing their <code>throttled_until</code> — they then appear on the kitchen Display Terminal.</li>
              <li>Recalculates each remaining queued order&apos;s diner-facing wait so the ETA stays accurate as the queue moves.</li>
            </ul>
          </SubSection>

          <SubSection title="Tuning capacity (Max orders / per minutes)">
            <p>
              Two numbers define each station&apos;s throughput:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Max orders</strong> — how many tickets the station can comfortably handle within the window.</li>
              <li><strong>Window minutes</strong> — the rolling time window that <em>Max orders</em> applies to.</li>
            </ul>
            <p>
              The release rate is simply <code>window / max</code>. Some real-world starting points:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Pizza oven</strong> doing 6 pies in 10 min → <em>6 / 10</em> (one pie every ~1.7 min).</li>
              <li><strong>Two-person cocktail bar</strong> → <em>4 / 10</em> (one cocktail every ~2.5 min).</li>
              <li><strong>Single barista on espresso</strong> → <em>8 / 10</em> (one coffee every ~75 sec).</li>
              <li><strong>Hot kitchen line on a Friday</strong> → start at <em>5 / 10</em>, watch a real service, adjust.</li>
              <li><strong>Take-away pickup window</strong> → usually high throughput, <em>10 / 10</em> or higher.</li>
            </ul>
            <p>
              <strong>Base prep time</strong> is the venue&apos;s normal completion time for that station when there&apos;s no queue (e.g. 15 min for kitchen, 4 min for bar). It seeds the diner-facing ETA before any throttle delay is added.
            </p>
            <Tip>
              Always run <strong>Test mode</strong> for at least a week before going live in Auto. The Throttling page shows queue history so you can see what <em>would have</em> been queued and adjust Max orders / window before any diners actually wait.
            </Tip>
          </SubSection>

          <SubSection title="What the diner sees">
            <p>
              The diner&apos;s order screen shows the headline ETA <em>plus</em> any extra wait the queue has added. If their order picked up 12 min of throttle delay, they see:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>The headline ETA is automatically extended (e.g. &quot;35 min&quot; instead of &quot;15 min&quot;).</li>
              <li>A subtle line underneath: <em>&quot;Kitchen is busy — extra ~12m wait&quot;</em>.</li>
            </ul>
            <p>
              You can disable the explanation line per-station with the <strong>Show wait to diner</strong> toggle if you&apos;d rather absorb the delay silently — the headline ETA still adjusts, but the &quot;kitchen is busy&quot; message is hidden.
            </p>
            <p>
              Diners are <em>never</em> blocked from ordering by throttling. The cart still checks out, payment still processes, the order still gets placed. The only thing that changes is when the kitchen sees it and what ETA the diner is shown.
            </p>
          </SubSection>

          <SubSection title="What the kitchen sees">
            <p>
              The Display Terminal for that area only shows tickets that have been released — i.e. <code>throttled_until</code> is null or in the past. Queued tickets are invisible to the kitchen, which is the whole point: chefs only see what they should be cooking right now.
            </p>
            <p>
              On the manager&apos;s Orders page, queued orders show with a small &quot;<strong>+12m delay applied</strong>&quot; badge so you can see at a glance what&apos;s been throttled and by how much.
            </p>
          </SubSection>

          <SubSection title="Multi-station orders">
            <p>
              An order with items routing to multiple stations (e.g. a burger from Kitchen + a beer from Bar) takes the <strong>latest release time</strong> across all its stations. The order isn&apos;t &quot;ready for the floor&quot; until every station can take it. The diner-facing ETA uses the <strong>highest extra wait</strong> from any single station so they&apos;re never under-quoted.
            </p>
          </SubSection>

          <SubSection title="Bumping a single order">
            <p>
              The <strong>Bump next</strong> button on any station releases the oldest queued order for that station immediately — useful for:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>VIP guests or regulars you want to look after.</li>
              <li>A kids&apos; meal that should never be made to wait.</li>
              <li>A re-fire after a kitchen mistake.</li>
              <li>An order that was placed before the rush but got caught behind it.</li>
            </ul>
            <p>The bump is logged as a <em>bumped</em> event in the audit trail with the queue size at the moment of the bump.</p>
          </SubSection>

          <SubSection title="Audit log and history">
            <p>
              Every throttle event is recorded in <code>order_throttle_log</code>: <em>queued</em> (held in Auto), <em>blocked</em> (held in Block), <em>released</em> (sent to the kitchen), <em>bumped</em> (manually released early). Each entry captures the queue size at that moment and the wait minutes added. This drives:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>The sparkline on each station&apos;s card (queue size over the last hour).</li>
              <li>Test-mode tuning data — what <em>would have</em> happened.</li>
              <li>Future weekly throttle reports (planned).</li>
            </ul>
          </SubSection>

          <SubSection title="Common scenarios">
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li>
                <strong>Friday 7pm rush.</strong> Kitchen is in Auto with <em>5 / 10</em>. The 6th order arrives → gets queued for 2 min → diner sees &quot;ETA 35 min, kitchen is busy ~10m&quot;. Kitchen receives one new ticket every 2 min and stays on top of the line.
              </li>
              <li>
                <strong>Coffee machine breaks.</strong> Barista taps <strong>Block</strong> on the Bar station with a 20-min timeout. All new drink orders queue with diners seeing &quot;Bar is busy, ~20m wait&quot;. Tech fixes the machine in 15 min, manager taps <strong>Auto</strong>, the queue clears at the controlled rate over the next 5–10 min instead of dumping 30 drinks at once.
              </li>
              <li>
                <strong>Tuning a new station.</strong> You add a Dessert station and don&apos;t know its capacity. Set it to <strong>Test</strong> mode at <em>4 / 10</em>. Run Friday and Saturday service. Review the queue sparkline — if Test would have queued 15 desserts at 9pm, the kitchen probably can&apos;t actually do 4 / 10. Drop to <em>3 / 10</em> and switch to Auto next weekend.
              </li>
              <li>
                <strong>VIP at table 7.</strong> Their burger is queued behind 4 others on the kitchen. Manager taps <strong>Bump next</strong> on the Kitchen card → the burger is released immediately, kitchen sees it on the next refresh, the audit log records the bump.
              </li>
              <li>
                <strong>End of service.</strong> Last orders go in at 9:30pm. Kitchen finishes the queue by 9:45. Auto auto-flips back to Open. Nothing for staff to do.
              </li>
            </ul>
          </SubSection>

          <SubSection title="Permissions">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Owners and Managers</strong> — can change modes, edit capacity, bump orders, toggle throttling on/off per station.</li>
              <li><strong>Staff with the <em>Orders</em> nav permission</strong> — see the status strip on the Orders page and can see queued tickets with the delay badge, but cannot change throttle settings.</li>
              <li><strong>Display Terminals</strong> — only show released tickets. They never see throttled orders, regardless of which staff member is logged in.</li>
            </ul>
          </SubSection>

          <SubSection title="Troubleshooting">
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li><strong>&quot;Orders are queueing but kitchen is empty.&quot;</strong> Check that Display Terminals are paired to the right Display Areas — a queued kitchen order won&apos;t appear on a terminal that&apos;s only watching the Bar area.</li>
              <li><strong>&quot;Diner sees a long wait but our queue is short.&quot;</strong> Multi-station orders take the longest wait across all stations. Check whether the Bar (or another station the order touches) is the bottleneck, not the Kitchen.</li>
              <li><strong>&quot;Mode keeps flipping Open ↔ Auto every minute.&quot;</strong> Your Max orders is too close to your actual ticket rate. Increase Max orders by 1–2, or increase the window slightly.</li>
              <li><strong>&quot;Blocked station never came back online.&quot;</strong> Block always auto-reverts after the timeout (default 15 min). If it&apos;s stuck, manually tap Auto or Open. Check that the throttle-tick background job is running (it runs every 30s).</li>
              <li><strong>&quot;I changed the mode but nothing happened for 30 seconds.&quot;</strong> Mode changes apply to <em>new</em> orders immediately, but the queue audit and diner ETAs refresh on the 30-second tick.</li>
            </ul>
          </SubSection>

          <SubSection title="Best practices">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Leave every station in <strong>Auto</strong> as the standby mode — it self-manages and only kicks in when load demands it.</li>
              <li>Always start a new station in <strong>Test</strong> mode for at least a week before going live.</li>
              <li>Review queue history monthly. If Auto kicked in <em>often</em>, your capacity is probably set too low. If it <em>never</em> kicked in even on busy nights, you might be over-provisioned (or staff are heroically keeping up — talk to them).</li>
              <li>Use <strong>Block</strong> sparingly and always with a realistic timeout. A 60-min block on the Kitchen will silently push every order into a long delay.</li>
              <li>Brief front-of-house staff that the &quot;+12m delay applied&quot; badge means the kitchen won&apos;t see that ticket yet — so don't go chasing the chef about it.</li>
              <li>Keep the diner-facing wait message <strong>on</strong> by default. A clear &quot;kitchen is busy&quot; beats a silent 20-min wait every time.</li>
            </ul>
            <Tip>The fastest way to validate your setup: pick one station, switch it to Test on a Friday night, look at the queue sparkline on Monday. The numbers don't lie.</Tip>
          </SubSection>
        </Section>

        {/* Analytics */}
        <Section id="analytics" title="Analytics" icon={TrendingUp}>
          <SubSection title="Revenue &amp; Performance">
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
              <li><strong>Personalised Welcome</strong> — Custom greeting based on loyalty tier with merge fields (</li>
            </ul>
          </SubSection>
        </Section>

        {/* Test Cards */}
        <Section id="test-cards" title="Test Cards" icon={CreditCard}>
          <SubSection title="Payment Testing">
            <p>When your venue is in Test mode (Settings → Payments), use these test card numbers to simulate different payment scenarios. No real charges are made in test mode.</p>
          </SubSection>
          <SubSection title="Card Numbers">
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 px-3 font-medium">Card Type</th>
                    <th className="py-2 px-3 font-medium">Number</th>
                    <th className="py-2 px-3 font-medium">Expiry</th>
                    <th className="py-2 px-3 font-medium">CVC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2 px-3">Visa</td><td className="py-2 px-3 font-mono">4111 1111 1111 1111</td><td className="py-2 px-3">03/30</td><td className="py-2 px-3">737</td></tr>
                  <tr><td className="py-2 px-3">Mastercard</td><td className="py-2 px-3 font-mono">5555 3412 4444 1115</td><td className="py-2 px-3">03/30</td><td className="py-2 px-3">737</td></tr>
                  <tr><td className="py-2 px-3">Amex</td><td className="py-2 px-3 font-mono">3700 0000 0000 002</td><td className="py-2 px-3">03/30</td><td className="py-2 px-3">7373</td></tr>
                  <tr><td className="py-2 px-3">Visa (3DS2)</td><td className="py-2 px-3 font-mono">4871 0499 9999 0006</td><td className="py-2 px-3">03/30</td><td className="py-2 px-3">737</td></tr>
                  <tr><td className="py-2 px-3">Declined</td><td className="py-2 px-3 font-mono">4000 0000 0000 0002</td><td className="py-2 px-3">03/30</td><td className="py-2 px-3">737</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Use any future expiry date and valid CVC. The 3DS2 card triggers 3D Secure authentication flow. The Declined card simulates a failed payment.
            </p>
          </SubSection>
          <Tip>Test mode is safe — no real charges are made. Set your venue to Test in Settings → Payments before using these cards.</Tip>
        </Section>

        {/* Settings */}
        <Section id="settings" title="Settings" icon={Settings}>
          <SubSection title="Details">
            <p>Update your venue name, type, address, contact information, logo, and operating hours. This information is displayed to diners and used by the AI assistant.</p>
          </SubSection>
          <SubSection title="Users &amp; Roles">
            <p>Permissions in H&L OrderNOW work in <strong>two layers</strong>: a <em>role</em> controls which sidebar areas a user can see, and <em>per-user toggles</em> refine what they can actually do inside Orders.</p>

            <p className="font-semibold mt-3">Layer 1 — Roles (sidebar access)</p>
            <p>Each venue defines its own roles under <strong>Settings → Users → Roles</strong>. Three system roles are seeded automatically and cannot be deleted: <strong>Owner</strong>, <strong>Manager</strong>, and <strong>Staff</strong>. You can create additional roles like &quot;Bar Staff&quot;, &quot;Floor Lead&quot;, or &quot;Kitchen Only&quot;.</p>
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
              <li><strong>Process Refunds</strong> — show the <em>Re-open &amp; Refund</em> button that re-opens the order <em>and</em> processes a refund through H&L Pay.</li>
            </ul>

            <p className="mt-3"><strong>Worked examples:</strong></p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><em>Line cook</em> (role: Staff) — Update Status on, both re-open toggles off. Can advance orders through the kitchen workflow but can&apos;t touch closed orders.</li>
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
          <SubSection title="H&L OrderNOW AI">
            <p>Customise your AI dining assistant:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Agent Name</strong> — What your AI introduces itself as.</li>
              <li><strong>Tone</strong> — Casual, professional, or playful.</li>
              <li><strong>Opening Message</strong> — The first thing diners see.</li>
              <li><strong>Venue Context</strong> — Background info the AI uses to answer questions (e.g. &quot;We're a modern Australian bistro, BYO wine&quot;).</li>
              <li><strong>Agent Icon</strong> — Custom avatar for the chat interface.</li>
            </ul>
          </SubSection>
          <SubSection title="Payments — H&L Pay">
            <p>H&L Pay is H&L OrderNOW&apos;s built-in payments product. We act as your payment facilitator (PayFac) end-to-end — application, underwriting, merchant account setup, funding, fee collection, statements, and chargeback management — so you don&apos;t need a separate processor account or API keys.</p>
            <SubSection title="Onboarding flow">
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li><strong>Application</strong> — submit your venue and business details.</li>
                <li><strong>Underwriting</strong> — our risk team reviews your application (usually 1–3 business days).</li>
                <li><strong>Approval</strong> — once approved, your H&L Pay merchant ID is issued and Settings → Payments shows the &quot;Approved&quot; badge.</li>
                <li><strong>Funding</strong> — settled funds land in your nominated bank account on a daily rolling schedule.</li>
              </ol>
            </SubSection>
            <SubSection title="What you can configure">
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li><strong>Mode</strong> — Test or Live. Always run end-to-end in Test mode before flipping to Live.</li>
                <li><strong>Capture mode</strong> — Immediate (charge when the order is placed) or Manual (authorise now, capture later when the order is fulfilled).</li>
                <li><strong>Statement descriptor</strong> — what your diner sees on their bank statement (max 22 characters).</li>
                <li><strong>Country &amp; default currency</strong> — used for new payments and wallet configuration.</li>
              </ul>
            </SubSection>
            <SubSection title="Wallets — Apple Pay &amp; Google Pay">
              <p>Apple Pay and Google Pay are enabled automatically on your H&L Pay account, including domain verification. Diners on Safari (iPhone/Mac) see Apple Pay; diners on Chrome/Android see Google Pay. Anonymous guests can pay with their wallet too — no account or card entry required.</p>
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
          Need more help? Contact us at support@shyndig.com
        </p>
      </div>
    </div>
  );
}
