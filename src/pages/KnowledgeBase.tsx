import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, LayoutDashboard, UtensilsCrossed, Tag, QrCode, ClipboardList,
  TrendingUp, Users, Settings, BarChart3, ChevronRight, Rocket, Sparkles,
  SlidersHorizontal, Gift, Bot, CreditCard, Receipt, FileText, Menu, X, Monitor, Sliders, Plug,
  MonitorSmartphone, Search, Layers, Percent, BellRing
} from "lucide-react";
import { cn } from "@/lib/utils";


interface TocItem {
  id: string;
  label: string;
  icon: any;
}

const tocItems: TocItem[] = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "pos-terminal-ui", label: "POS Terminal Interface", icon: MonitorSmartphone },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "shyndig-ai-analytics", label: "Spark AI Analytics", icon: BarChart3 },
  { id: "menu-builder", label: "Menu Builder", icon: UtensilsCrossed },
  { id: "zones-menus", label: "Zones & Multiple Menus", icon: Layers },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "tables-qr", label: "Tables & QR", icon: QrCode },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "open-tabs", label: "Open Tabs & Split Payments", icon: Receipt },
  { id: "service-modes", label: "Service Modes & Ready Alerts", icon: BellRing },
  { id: "display-terminals", label: "Display Terminals", icon: Monitor },
  { id: "operational-throttling", label: "Operational Throttling", icon: Sliders },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
  { id: "diners", label: "Diners", icon: Users },
  { id: "pubplus", label: "Pub+ Loyalty", icon: Gift },
  { id: "surcharges", label: "Gratuities & Surcharges", icon: Percent },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "pos-integration", label: "POS Integrations", icon: Plug },
  { id: "test-cards", label: "Test Cards", icon: CreditCard },

];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Section({ id, title, icon: Icon, children, hidden }: { id: string; title: string; icon: any; children: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <section id={id} data-kb-section={id} data-kb-title={title} className="scroll-mt-40">
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const initialSection = searchParams.get("section");
  const [search, setSearch] = useState(initialQ);
  const contentRef = useRef<HTMLDivElement>(null);

  const query = search.trim().toLowerCase();

  // After re-render, compute which section IDs match the search by reading rendered text.
  const [matchIds, setMatchIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!query) { setMatchIds(null); return; }
    const root = contentRef.current;
    if (!root) return;
    const next = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-kb-section]").forEach((el) => {
      const text = (el.textContent || "").toLowerCase();
      if (text.includes(query)) next.add(el.dataset.kbSection!);
    });
    setMatchIds(next);
    // Auto-scroll to first matching section so search "takes you there".
    const firstId = tocItems.find((t) => next.has(t.id))?.id;
    if (firstId) {
      requestAnimationFrame(() => scrollTo(firstId));
    }
  }, [query]);

  // Keep ?q= in the URL in sync with search input (so links share state).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set("q", search); else next.delete("q");
    // Drop section once user starts searching to avoid fighting scroll targets.
    if (search) next.delete("section");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // On mount: if a ?section=… deep-link is present, scroll to it once rendered.
  useEffect(() => {
    if (!initialSection) return;
    // Wait for sections to render.
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(initialSection);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (attempt < 10) {
        setTimeout(() => tryScroll(attempt + 1), 50);
      }
    };
    tryScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleToc = useMemo(() => {
    if (!matchIds) return tocItems;
    return tocItems.filter((t) => matchIds.has(t.id));
  }, [matchIds]);

  const isHidden = (id: string) => !!matchIds && !matchIds.has(id);


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
          {visibleToc.length === 0 && (
            <p className="text-xs text-muted-foreground italic px-3 py-2">No sections match "{search}".</p>
          )}
          {visibleToc.map((item) => (
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
      <div className="flex-1 min-w-0">
        {/* Sticky header with search */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 space-y-3 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">Everything you need to set up and run your venue on H&L OrderNOW.</p>
          </div>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search the knowledge base..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {query && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {matchIds ? `${matchIds.size} section${matchIds.size === 1 ? "" : "s"} match` : "Searching..."}
                {" — "}
                <button onClick={() => setSearch("")} className="text-primary hover:underline">clear</button>
              </p>
            )}
          </div>
          <Separator />
        </div>

        {/* Sections */}
        <div ref={contentRef} className="space-y-8 pt-2">


        {/* Getting Started */}
        <Section id="getting-started" title="Getting Started" icon={Rocket} hidden={isHidden("getting-started")}>
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
          <SubSection title="Self Onboard Agent (recommended)">
            <p>The fastest way to go live is the <strong>Self Onboard</strong> button in the top bar (sparkle icon, next to the help icon). It opens a full-screen AI specialist that walks you through every step, answers questions, and can perform safe actions for you (add tables in bulk, set GST, configure your AI agent, record your POS strategy, etc.).</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Live readiness score with blockers highlighted.</li>
              <li>One-click <strong>Go Live</strong> button enabled once every required step is complete.</li>
              <li>Hides itself after you go live. You can reopen it any time from Settings.</li>
            </ul>
          </SubSection>
          <Tip>QR codes are permanent — once printed, they never change. You can safely order stickers.</Tip>
        </Section>

        {/* POS Terminal Interface */}
        <Section id="pos-terminal-ui" title="POS Terminal Interface" icon={MonitorSmartphone} hidden={isHidden("pos-terminal-ui")}>
          <SubSection title="A real terminal, in the browser">
            <p>H&L OrderNOW runs inside a virtual <strong>POS terminal chassis</strong> — a dark, bezelled frame locked to the viewport on desktop and tablet. The frame stays fixed while only the &quot;screen&quot; inside scrolls, exactly like a physical Lightspeed/Revel-style terminal at the pass. The chassis is hidden on phones so you get the full screen on the floor.</p>
          </SubSection>

          <SubSection title="Top status bar">
            <p>The bar across the top of the terminal is always visible and shows, left to right:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>H&L OrderNOW logo</strong> — taps return you to the Dashboard.</li>
              <li><strong>Venue name &amp; Site ID</strong> — the last 4 characters of the venue UUID, printed beside the venue name (e.g. <code>Bondi Bistro · #1042</code>). Click the venue name to switch venues if you operate more than one.</li>
              <li><strong>Shift label</strong> — inferred from the current time of day (Breakfast / Lunch / Dinner / Late) until a real shift table is wired in.</li>
              <li><strong>Logged-in user &amp; role</strong> — display name plus a role badge (Owner, Manager, Staff, custom role).</li>
              <li><strong>Live date &amp; clock</strong> — ticks every second in <code>tabular-nums</code> so the digits don&apos;t jitter. Formatted for Australia/Sydney with a user-locale fallback.</li>
            </ul>
          </SubSection>

          <SubSection title="Tile navigation (left rail)">
            <p>The sidebar is a vertical stack of <strong>chunky POS tiles</strong> — icon on top, label beneath — grouped into Operations and (where applicable) Group + Admin, separated by hairline dividers with small uppercase group labels.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>The <strong>active tile</strong> shows an H&L Blue accent strip down its left edge plus a tinted background.</li>
              <li>Hovering any tile gives a subtle blue glow.</li>
              <li>The <strong>pin toggle</strong> at the bottom of the rail collapses tiles to icon-only (64px) or expands them with labels (88px). The state persists per browser.</li>
              <li>On phones the rail collapses to a hamburger drawer — same items, same order.</li>
            </ul>
          </SubSection>

          <SubSection title="Status footer rail">
            <p>The bar across the bottom of the chassis is the system health strip:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Online LED</strong> — H&L Green when the browser reports network up, red when offline. Reacts immediately to <code>online</code> / <code>offline</code> events.</li>
              <li><strong>Printer</strong> — placeholder &quot;Ready&quot; LED today; will read from real docket-printer status when that signal lands.</li>
              <li><strong>Card Terminal</strong> — same — &quot;Ready&quot; placeholder until live H&L Pay terminal status is wired in.</li>
              <li><strong>Version</strong> — current app build (<code>VITE_APP_VERSION</code>, defaults to <code>v1.0</code>).</li>
              <li><strong>Sign Out</strong>, theme toggle, sidebar pin, and Co-Pilot trigger all live here.</li>
            </ul>
          </SubSection>

          <SubSection title="Co-Pilot and overlays">
            <p>The Co-Pilot side panel and the idle-timeout modal mount <em>outside</em> the bezel so they cover the chassis as well as the screen — the same way a real terminal would lock its overlays over the whole display.</p>
          </SubSection>

          <SubSection title="Idle logout">
            <p>If the terminal sits idle for the configured timeout, the idle modal appears in the centre of the screen and counts down before signing you out — same behaviour any cashier expects on a shared POS station. Touching the screen or pressing any key resets the timer.</p>
          </SubSection>

          <SubSection title="Theme">
            <p>The chassis renders correctly in both light and dark modes. The system follows your saved preference; toggle from the footer rail. The H&L OrderNOW logo and brand colours (H&L Blue, H&L Green) are unchanged — only the surrounding chassis darkens.</p>
          </SubSection>

          <Tip>Treat the terminal as a single shared workstation: pin tiles for fast access on busy nights, leave the chassis bezel on for the front-of-house Mac mini, and use the Sign Out button (footer rail) between shifts so the next operator&apos;s user, role and audit trail are recorded correctly.</Tip>
        </Section>

        {/* Dashboard */}
        <Section id="dashboard" title="Dashboard" icon={LayoutDashboard} hidden={isHidden("dashboard")}>
          <SubSection title="What it is">
            <p>The Dashboard is your at-a-glance operating view for the venue — refreshed in near real-time. It's designed for the manager-on-shift to glance at between covers and instantly see &quot;are we on track tonight?&quot;. For deeper trend analysis use the Analytics page; for AI-specific metrics use Spark AI Analytics.</p>
          </SubSection>

          <SubSection title="The date picker">
            <p>Top-right of the page. Presets: <strong>Today</strong>, <strong>Yesterday</strong>, <strong>This Week</strong>, <strong>Last 7 Days</strong>, <strong>This Month</strong>, <strong>Last 30 Days</strong>, <strong>Custom range</strong>. The selected range applies to every tile and chart on the page. Default on load is Today.</p>
          </SubSection>

          <SubSection title="KPI tiles (top row)">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Revenue</strong> — total of completed (paid) orders in range, net of refunds. Excludes cancelled and abandoned orders.</li>
              <li><strong>Orders</strong> — count of completed orders. Multi-item orders count as one.</li>
              <li><strong>Avg Ticket</strong> — Revenue ÷ Orders. The single best leading indicator of upsell health.</li>
              <li><strong>Ticket Times</strong> — median time from Received → Served across the range. Throttled tickets count the queued time too.</li>
            </ul>
            <p>Each tile shows the change vs the previous comparable period (Today vs Yesterday, This Week vs Last Week, etc.) as a coloured % arrow.</p>
          </SubSection>

          <SubSection title="Revenue by Hour">
            <p>Bar chart of revenue bucketed by hour of day across the selected range. Use it to spot the actual shape of your trade — most venues are surprised by how much revenue is concentrated in a 90-min window. Pair it with Throttling capacity tuning: if 65% of your revenue lands between 7–9pm, your stations need to be sized for that, not the daily average.</p>
          </SubSection>

          <SubSection title="Table Utilisation">
            <p>Heat-style table showing revenue and cover count per table over the range. Highlights:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Dead tables</strong> — low utilisation may mean a bad QR position (under a fold of menu) or an awkward floor location.</li>
              <li><strong>Hero tables</strong> — outsized revenue often = bar / window seats. Worth knowing for reservation prioritisation.</li>
            </ul>
          </SubSection>

          <SubSection title="Top Items">
            <p>Two charts side-by-side: best sellers by <em>quantity</em> and best sellers by <em>revenue</em>. A high-quantity / low-revenue item is a hook (e.g. fries) — great for footfall but not for margin. A low-quantity / high-revenue item is a hero dish — make sure it's prominently featured on the Landing Page.</p>
          </SubSection>

          <SubSection title="Ticket Times card">
            <p>Distribution of order completion times: P50 (median), P90, and the slowest 10%. If P90 is creeping over your target service time, check Throttling capacity, kitchen staffing, and the Display Terminal heartbeat (an offline kitchen iPad explains a lot of slow tickets).</p>
          </SubSection>

          <SubSection title="Abandonment card">
            <p>Counts diners who scanned, opened the chat, but never placed an order. A high abandonment rate after AI changes usually means the agent's tone or opening message needs tweaking — go to Settings → H&L OrderNOW AI.</p>
          </SubSection>

          <Tip>Bookmark a Custom range like &quot;Last Friday&quot; and compare it to the same chart with the range set to &quot;Two Fridays ago&quot;. Week-over-week comparison on the same day of week is the single most useful trend you'll look at as a hospo operator.</Tip>
        </Section>

        {/* Spark AI Analytics */}
        <Section id="shyndig-ai-analytics" title="Spark AI Analytics" icon={BarChart3} hidden={isHidden("shyndig-ai-analytics")}>
          <SubSection title="What it tracks">
            <p>Spark AI Analytics is the &quot;is the AI actually working?&quot; dashboard. It tracks every conversation between a diner and your H&L OrderNOW agent and shows you how well the agent is converting, upselling, and being received. Use it to tune your agent's tone, opening message, and venue context.</p>
          </SubSection>

          <SubSection title="Headline metrics">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Chat Sessions</strong> — total unique diner conversations in range. One session per QR scan + chat-open, regardless of how many messages.</li>
              <li><strong>Conversion Rate</strong> — Sessions that led to at least one placed order ÷ total sessions. Healthy range: 40–65% for dine-in, 25–45% for browse-mode landings.</li>
              <li><strong>Items Added via AI</strong> — count of cart items added directly from an AI suggestion (e.g. agent recommends a side, diner taps Add). Measures upsell effectiveness.</li>
              <li><strong>Messages per Session</strong> — average back-and-forth count. 3–6 is the sweet spot. Higher often means the agent is failing to understand intent; lower can mean diners aren't engaging at all.</li>
              <li><strong>AI Generated Revenue</strong> — revenue attributed to AI actions (chat upsells, AI campaign clicks, AI-recommended specials). Surfaces the dollar value of the agent.</li>
            </ul>
          </SubSection>

          <SubSection title="Reading the trend lines">
            <p>Each metric has a sparkline showing the last 14 days. Watch for:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Sudden drop in conversion = something broke (broken modifier, out-of-stock item still on menu, payment misconfig). Open Orders and check error rate.</li>
              <li>Steady drop in messages-per-session with steady conversion = AI is getting <em>more</em> efficient. Good.</li>
              <li>Rising messages-per-session with falling conversion = AI is confused. Revisit your Venue Context and menu descriptions.</li>
            </ul>
          </SubSection>

          <SubSection title="Top AI suggestions table">
            <p>Lists the items the AI most frequently recommended, with accept rate. Items with high recommendations but low accept rate are misaligned — either the description oversells, the price is too high for the moment, or the photo isn't compelling. Items with high accept rate are AI heroes — make sure they're well-stocked.</p>
          </SubSection>

          <SubSection title="Tuning loop">
            <StepList steps={[
              "Pick the worst-performing metric on the page (usually conversion or accept rate).",
              "Open the related setting: Settings → H&L OrderNOW AI for tone/opening, Menu Builder for item descriptions and photos.",
              "Make one change at a time so you can attribute the impact.",
              "Wait 24–72 hours for enough sessions to flow through, then re-check.",
              "Repeat. The agent gets noticeably better with 3–4 tuning passes.",
            ]} />
          </SubSection>

          <Tip>If conversion is below 30%, the issue is almost never the AI itself — it's usually missing item photos, vague descriptions, or no obvious specials. Fix the menu, then re-measure.</Tip>
        </Section>

        {/* Menu Builder */}
        <Section id="menu-builder" title="Menu Builder" icon={UtensilsCrossed} hidden={isHidden("menu-builder")}>
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
            <p>The fastest way to populate a new venue. Upload a photo, scan, or PDF of your existing printed menu and AI extracts categories, items, descriptions and prices in one pass.</p>
            <StepList steps={[
              "Menu Builder → Settings (cog) → AI Features → Import Menu.",
              "Upload your menu file. Supported: PDF, JPG, PNG, HEIC. Max ~20MB. Multi-page PDFs are read end-to-end.",
              "Wait 20–60 seconds while the AI parses. A preview table appears with category, name, price and description for every detected item.",
              "Edit anything that's mis-read — OCR sometimes mangles unusual ingredients or handwriting. Toggle off any item you don't want to import.",
              "Click Import All. Items land in the chosen category (or a new one if needed). Existing items aren't overwritten by default.",
              "Add photos: either use Enhance Images on photos you already have, or Generate Images for the rest.",
            ]} />
            <p>What the AI extracts well: standard printed menus, clear typography, common dish names, AUD prices, allergen icons. What it struggles with: handwritten chalkboards, heavy decorative fonts, photos of menus at sharp angles. Re-shoot or re-scan if the preview looks rough.</p>
          </SubSection>

          <SubSection title="Enhance Images">
            <p>Takes an existing food photo and improves lighting, colour balance, sharpness and background. Use it when:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>You have iPhone shots from the kitchen pass that look flat.</li>
              <li>The photo has clutter (other plates, hands, menus) that distracts.</li>
              <li>The lighting is yellow/warm and you want the food to pop.</li>
            </ul>
            <p>Open the item → Image → <strong>Enhance</strong>. Pick a preset (Brighter, Punchier, Studio, Cosy). Compare before/after side-by-side. Save replaces the existing image (the original is kept in version history for 30 days).</p>
          </SubSection>

          <SubSection title="Generate Images (AI)">
            <p>Creates a professional-looking food photo from scratch using the item name and description. Use it as a stop-gap when you don't have a real photo, or as a placeholder while you book a photographer.</p>
            <StepList steps={[
              "Open the item → Image → Generate with AI.",
              "Review the auto-filled prompt (built from the item's name + description). Tweak it to mention plating, garnish, surface (e.g. 'on a dark slate plate, overhead shot, natural light').",
              "Pick an aspect ratio (square for menu cards, 4:5 for hero feeds).",
              "Click Generate. 2–4 variations appear in ~15s.",
              "Pick one — it's saved as the item's image. Generate again for more variations if none are right.",
            ]} />
            <Tip>AI-generated photos are great for landings but diners can sometimes spot them. Replace with a real photo within the first month of trading where possible — conversion lifts measurably.</Tip>
          </SubSection>

          <SubSection title="Display Areas (kitchen routing)">
            <p>Every item routes to one or more <strong>Display Areas</strong> (Kitchen, Bar, Coffee, Dessert, Take Away, etc.). The Display Area determines which Display Terminals show the ticket and which Throttling station's capacity it counts against. Edit areas under Menu Builder → Settings → Display Areas; assign per item or per category.</p>
            <p>Cross-station orders (e.g. a burger + a cocktail) are split visually on each terminal but tracked as one order on the manager view. See <em>Display Terminals</em> and <em>Operational Throttling</em> for the full flow.</p>
          </SubSection>

          <SubSection title="POS ID (PLU)">
            <p>Each item and modifier has a <strong>POS ID</strong> field — the PLU H&L OrderNOW sends to your H&L Exceed POS when integration is enabled. Get the PLU from your existing H&L product file and paste it in. A wrong or missing PLU causes the POS push to be rejected. Full details under <em>POS Integration — H&L Exceed Web Orders</em>.</p>
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
        <Section id="pricing" title="Pricing" icon={Tag} hidden={isHidden("pricing")}>
          <SubSection title="What dynamic pricing does">
            <p>Pricing rules let you automatically adjust menu prices based on time, day, event, or weather — without re-editing individual item prices. The base price you set in Menu Builder is always the &quot;reference&quot; price; rules apply a percentage modifier on top of it at checkout. Diners see the adjusted price in the AI chat, on the menu feed, and on their receipt; the original is never shown.</p>
            <p>Where to find it: <strong>Pricing</strong> in the sidebar. Anyone with the <em>Pricing</em> nav permission on their role can view; <em>Manage Settings</em> is required to create, edit, or activate rules.</p>
          </SubSection>

          <SubSection title="The four rule types">
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li><strong>Happy Hour</strong> — Time-windowed discount. The classic use case: 20% off all drinks Mon–Thu 4–6pm. Set a negative modifier (e.g. <code>-20</code>).</li>
              <li><strong>Late Night</strong> — Time-windowed premium. Adds a small surcharge (e.g. <code>+10</code>) after a cutoff to cover late staffing. Different from Happy Hour only by intent — it's the same engine.</li>
              <li><strong>Special / Event</strong> — One-off rule tied to a specific date range. Use for Mother's Day premium menus, NYE surcharge, or a sponsored discount weekend.</li>
              <li><strong>Weather</strong> — Adjusts pricing based on observed conditions (e.g. discount on cold drinks when it's hot). Reads the venue's location and the current forecast; the rule only triggers when the condition matches.</li>
            </ul>
          </SubSection>

          <SubSection title="Setting up a rule (walkthrough)">
            <StepList steps={[
              "Pricing → Add Pricing Rule.",
              "Pick a rule type (Happy Hour, Late Night, Special/Event, Weather).",
              "Give it a clear internal name — this is for staff, not diners (e.g. 'Mon-Thu Drinks Happy Hour').",
              "Set the modifier: negative for a discount, positive for a surcharge. e.g. -20 = 20% off, +10 = 10% added.",
              "Pick the days of the week the rule runs (untick any days it shouldn't apply).",
              "Set the start and end times for those days (24-hour clock).",
              "Scope the rule: applies to All items, a Category, or specific menu Items. Narrower scope wins for clarity.",
              "Leave Active off until you've tested. When ready, flip Active on — the rule applies on the next order.",
            ]} />
          </SubSection>

          <SubSection title="How rules stack">
            <p>If two rules apply to the same item at the same moment, their <strong>percentages combine multiplicatively</strong>. Example: a -20% Happy Hour + a -10% loyalty discount on a $10 beer:</p>
            <p className="font-mono text-xs bg-muted/40 rounded p-2">$10 × 0.80 × 0.90 = $7.20</p>
            <p>This means stacking three 10% discounts is <em>not</em> 30% off — it's ~27% off. Plan accordingly so you don't accidentally give away margin.</p>
          </SubSection>

          <SubSection title="Editing and disabling">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Toggle <strong>Active</strong> off to pause a rule without deleting it — its config is preserved for later.</li>
              <li>Editing an active rule applies the change on the next order. Already-placed orders are not retroactively repriced.</li>
              <li>Delete a rule only when you're sure it's not coming back — there's no archive view.</li>
            </ul>
          </SubSection>

          <SubSection title="Interactions">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Modifiers</strong> — the modifier's own price is applied <em>before</em> percentage rules, so a $2 &quot;Extra cheese&quot; on a Happy Hour burger is also discounted by the Happy Hour percentage.</li>
              <li><strong>AI upsells</strong> — the AI agent quotes the live (post-rule) price when it suggests an add-on, so upsells never break a happy-hour offer.</li>
              <li><strong>Loyalty</strong> — points are earned on the <em>paid</em> price after discounts, not on the reference price.</li>
              <li><strong>Receipts</strong> — only the final line price is shown to the diner; the rule name is recorded internally so Analytics can attribute revenue impact.</li>
            </ul>
          </SubSection>

          <Tip>Run a new rule with Active <em>off</em> first and review it in Analytics → Pricing simulations (if available) — or simply place a test order in the AI chat to confirm the adjusted price appears as expected. Once you flip it on, every diner sees the new price within seconds.</Tip>
        </Section>

        {/* Tables & QR */}
        <Section id="tables-qr" title="Tables &amp; QR" icon={QrCode} hidden={isHidden("tables-qr")}>
          <SubSection title="What it is">
            <p>The Tables &amp; QR page is the canonical list of every physical table in your venue, each with a permanent QR code. A QR scan opens the diner's AI ordering experience with the table number already attached — so orders, tabs, and payments all route correctly without staff input.</p>
          </SubSection>

          <SubSection title="Creating tables">
            <StepList steps={[
              "Tables & QR → Add Table.",
              "Enter the table number (matches your floor plan / POS — keep them consistent).",
              "Optionally set a Zone (e.g. 'Patio', 'Main Floor', 'Booth Wall') for filtering and reports.",
              "Optionally set Capacity (cover count) — used by future smart-seating features and helpful for Dashboard analytics today.",
              "Save. The QR code is generated immediately.",
            ]} />
          </SubSection>

          <SubSection title="Bulk add (numbered ranges)">
            <p>Add Table → <strong>Bulk add</strong> lets you create T1–T50 in one go. Pick a prefix (or none), a start, and an end. Assign a zone to all of them if they share one. You'll save 30 minutes vs adding individually.</p>
          </SubSection>

          <SubSection title="QR codes — permanent">
            <p><strong>QR codes never change.</strong> They're tied to the table's stable UUID, not its number or any URL parameter. This is critical: you can print stickers, laminate them, varnish them under a resin coat, and they will work forever. The Tab-Less platform guarantees this — no URL rotation, no expiry, no &quot;please reprint your QRs&quot;.</p>
            <StepList steps={[
              "Click the QR icon on any table row to open the preview.",
              "Download as PNG or PDF. PDF includes the table number printed beneath the QR.",
              "Bulk download: tick multiple tables and use 'Download selected as PDF' — one page per table.",
              "Print to sticker stock (we recommend matte vinyl, ~50×50mm for table-top; ~100×100mm for booth walls / windows).",
              "Apply to the table. Clean surface, square placement, away from glassware drip lines.",
            ]} />
          </SubSection>

          <SubSection title="Sticker design tips">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Include the table number prominently <em>next to</em> the QR — staff use it to confirm a diner is at the right table.</li>
              <li>Add a short call to action above the QR: &quot;Scan to order&quot; or &quot;No app needed&quot;.</li>
              <li>Use matte stock — gloss reflections kill scan reliability under hospitality lighting.</li>
              <li>Don't shrink below 30×30mm — phones struggle with anything smaller across a 4-top table.</li>
              <li>Order 10–15% spares. Bartenders spill things; stickers get peeled by curious toddlers.</li>
            </ul>
          </SubSection>

          <SubSection title="Editing &amp; deleting">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Edit</strong> a table to change its number, zone, or capacity. The QR code stays the same — only the metadata changes.</li>
              <li><strong>Deleting</strong> a table soft-archives it. The QR sticker, if scanned, will show a &quot;Table no longer available, please flag a staff member&quot; message. Historical orders are preserved on the table for reporting.</li>
              <li>You cannot permanently delete a table with orders attached — archive it instead.</li>
            </ul>
          </SubSection>

          <SubSection title="Dine-in vs take-away vs browse">
            <p>The QR scan starts a <em>dine-in session</em> by default — tied to the table, supports tabs, multiple diners on one table, and shared bill splitting. For takeaway, generate a single &quot;Takeaway&quot; QR (Tables &amp; QR → Add Takeaway Code) and post it at the counter. For browse-only landings (e.g. a window sticker for passersby), use a Venue QR that lands on the Landing Page without starting a session.</p>
          </SubSection>

          <Tip>Re-printing a sticker because it got damaged uses the same QR code — just download and print again. Never &quot;regenerate&quot; a QR thinking you need a fresh one. The URL hasn't changed and never will.</Tip>
        </Section>

        {/* Orders */}
        <Section id="orders" title="Orders" icon={ClipboardList} hidden={isHidden("orders")}>
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
        <Section id="display-terminals" title="Display Terminals" icon={Monitor} hidden={isHidden("display-terminals")}>
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
        <Section id="operational-throttling" title="Operational Throttling" icon={Sliders} hidden={isHidden("operational-throttling")}>
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
        <Section id="analytics" title="Analytics" icon={TrendingUp} hidden={isHidden("analytics")}>
          <SubSection title="What it is">
            <p>Analytics is the deeper-dive companion to the Dashboard. Where the Dashboard answers &quot;what's happening right now?&quot;, Analytics answers &quot;what's happened over time and why?&quot;. Use it weekly for trend reviews, monthly for menu engineering, and quarterly for pricing-rule ROI.</p>
          </SubSection>

          <SubSection title="Date range and comparison">
            <p>Top-right picker offers Today, Yesterday, This Week, Last 7 Days, This Month, Last 30 Days, This Quarter, Year to Date, and Custom range. Most charts overlay a <strong>comparison period</strong> (e.g. last 7 days vs the 7 days before) so you can see the delta at a glance. The comparison line is dashed; the current period is solid.</p>
          </SubSection>

          <SubSection title="Revenue trends">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Daily revenue</strong> — line chart with weekday/weekend banding so seasonality is visible.</li>
              <li><strong>Day-of-week heatmap</strong> — average revenue per weekday hour, across the range. Confirms your busiest 90-min windows.</li>
              <li><strong>Channel split</strong> — dine-in vs take-away vs delivery (where applicable).</li>
            </ul>
          </SubSection>

          <SubSection title="Item &amp; category performance">
            <p>Drill from category → item → modifier. Each row shows units sold, revenue, contribution margin (if cost is set), and rank movement vs the comparison period. Use this to:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Spot rising stars to feature on the Landing Page or push via an AI Instant Campaign.</li>
              <li>Identify dead stock to remove or reprice.</li>
              <li>Find &quot;modifier money&quot; — items where add-ons make up 30%+ of the line, worth investing in better modifier UX.</li>
            </ul>
          </SubSection>

          <SubSection title="Pricing rule ROI">
            <p>For each active Pricing Rule, see attributed revenue impact: total revenue at the discounted/surcharged price vs the modelled revenue if the rule wasn't applied. Use this to justify keeping a Happy Hour (or killing one that's just leaking margin).</p>
          </SubSection>

          <SubSection title="Throttling impact">
            <p>When Operational Throttling is enabled, an extra row shows the count of orders queued, average added wait time, and orders bumped manually. If queued counts spike on the same nights ticket times also spike, your station capacity needs to go up (not your throttle limits).</p>
          </SubSection>

          <SubSection title="Exports">
            <p>Each table view has an <strong>Export CSV</strong> button (top-right of the table). Exports respect the current date range, filters, and sort order. Useful for accountants who still want a spreadsheet at month end.</p>
          </SubSection>

          <Tip>The single most valuable Analytics view is the <strong>day-of-week heatmap</strong>. It tells you exactly when to staff up and which nights are worth a targeted CRM campaign to grow.</Tip>
        </Section>

        {/* Diners */}
        <Section id="diners" title="Diners — CRM" icon={Users} hidden={isHidden("diners")}>
          <SubSection title="Diner Directory">
            <p>The Diners page is a full multi-channel CRM, organised into four tabs:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Diners</strong> — directory of every guest who has interacted with your venue, with lifetime spend, last visit, birthday, RFM tier, loyalty status, and channel opt-ins.</li>
              <li><strong>Segments</strong> — build dynamic audiences using a visual rule builder, or accept AI-suggested lookalike segments.</li>
              <li><strong>Campaigns</strong> — compose, schedule and send multi-channel campaigns (Email, SMS, Push, In-app). Includes an AI composer and instant-campaign launcher.</li>
              <li><strong>Insights</strong> — RFM leaderboards, channel performance, and ROI of CRM &amp; AI campaigns.</li>
            </ul>
          </SubSection>

          <SubSection title="Enriched Diner Profile">
            <p>On signup (and via the profile screen) diners can optionally provide their <strong>birthday</strong> and set marketing consent per channel — Email, SMS and Push are all opt-in, never on by default. We also store a normalised mobile (E.164) and Web Push subscription when granted, plus a unique unsubscribe token used in every outbound message.</p>
            <p>Per diner per venue we automatically maintain stats: lifetime spend &amp; orders, average ticket, first/last visit, 90-day visit count, favourite category/item, preferred daypart, RFM scores and an auto-assigned <strong>RFM tier</strong> (Champion, Loyal, Potential Loyalist, At Risk, Lost). Stats refresh automatically on every completed visit.</p>
          </SubSection>

          <SubSection title="Segmentation">
            <p>Segments are stored as a JSON rule DSL and re-evaluated on demand or on a schedule. Supported fields include lifetime spend, average ticket, visit recency &amp; frequency, RFM tier, birthday month/day, favourite category, dietary tags, loyalty tier and channel eligibility. Channel suppression and opt-out are applied automatically at send time — you never have to filter manually.</p>
            <p><strong>AI lookalike segments</strong> use Gemini to propose named audiences like &quot;High-LTV wine lovers&quot; or &quot;At-risk weekend regulars&quot; from your aggregate stats. Review and publish the ones you like.</p>
          </SubSection>

          <SubSection title="Campaigns &amp; Channels">
            <p>Every campaign picks a channel, a segment, content, and an optional schedule. Channels:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Email</strong> — sent via Lovable Emails with a branded template and an auto-appended unsubscribe footer.</li>
              <li><strong>SMS</strong> — sent via Twilio with STOP keyword handling that flips the diner&apos;s SMS opt-in off automatically.</li>
              <li><strong>Push</strong> — Web Push (VAPID) to diners who installed/allowed the consumer PWA.</li>
              <li><strong>In-app</strong> — surfaced in the AI overlay and as a banner on the venue landing/menu when an eligible diner opens the app.</li>
            </ul>
            <p>Every CTA goes through a tracking token that sets a session referrer. When that diner orders, the order is attributed back to the campaign for revenue ROI.</p>
          </SubSection>

          <SubSection title="AI Instant Campaigns">
            <p>Use the <strong>AI Composer</strong> to draft a campaign from a goal (Daily special, Instant special, Win-back, Birthday, Kitchen-load boost, Contest, Announcement, Custom). The AI writes subject/preheader/body/SMS/push copy in your brand tone and respects venue guardrails:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Daily send cap and quiet hours (no sends after 9pm etc.).</li>
              <li>Maximum discount percentage the AI is allowed to offer.</li>
              <li>Allowed channels and eligible segments.</li>
              <li>Optional require-approval gate before send.</li>
            </ul>
            <p>Instant campaigns marked AI-generated contribute their attributed revenue to your <strong>AI Generated Revenue</strong> total in Spark Analytics — alongside AI chat and AI upsells.</p>
          </SubSection>

          <SubSection title="Loyalty Tracking">
            <p>If you have a loyalty programme configured (Settings → Loyalty), diner profiles show their current tier, points balance, and visit count. CRM segments can target loyalty tier &amp; balance directly.</p>
          </SubSection>

          <SubSection title="Diner Preferences (Personalisation)">
            <p>Configure how returning diners are treated when they interact with your venue — personalised welcome by loyalty tier, dietary memory, favourite item shortcuts and the marketing consent toggles described above.</p>
          </SubSection>

          <SubSection title="SMS Subscribers (Text Receipts &amp; Marketing List)">
            <p>The <strong>SMS Subscribers</strong> tab (Diners → SMS Subscribers) is a dedicated list of mobile numbers captured from guests who chose to <strong>text themselves a copy of their receipt</strong> at checkout — including walk-in guests who never created a frequent diner profile. It is intentionally kept <em>separate</em> from the Diners directory so you can market to one-off visitors without polluting your CRM, and so SMS consent is tracked independently of email/push consent on a registered profile.</p>

            <p className="font-medium mt-3">How a number lands in the list</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>On the diner receipt screen the guest taps <strong>Text Me a Copy</strong>, enters a mobile number, and optionally ticks <em>&quot;Yes, send me future specials and offers from this venue&quot;</em>.</li>
              <li>The <code>send-receipt-sms</code> edge function normalises the number to E.164 (defaults to the venue&apos;s country, Australia +61 unless overridden), upserts a row in <code>sms_subscribers</code> for that venue, records the receipt send, and — only if the box was ticked — sets <code>marketing_consent = true</code> with a timestamp and the consent source (<code>receipt_optin</code>).</li>
              <li>If the same number texts itself another receipt later, we increment <code>receipts_sent</code> and refresh <code>last_receipt_at</code> without duplicating the row.</li>
              <li>If they ticked the marketing box on a <em>later</em> visit, consent is upgraded; if they didn&apos;t, the row stays as a transactional-only contact (receipts allowed, marketing not).</li>
            </ul>

            <p className="font-medium mt-3">What you see in the tab</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Header KPIs</strong> — Total subscribers, Marketing-opted-in, Receipts sent (lifetime), and Unsubscribed.</li>
              <li><strong>Search</strong> — by phone number or by the order reference of the last receipt sent.</li>
              <li><strong>Filter chips</strong> — <em>All</em>, <em>Marketing opt-in</em>, <em>Transactional only</em>, <em>Unsubscribed</em>.</li>
              <li><strong>Row detail</strong> — E.164 number, first seen, last receipt, receipts sent count, marketing consent state + source + timestamp, and unsubscribe state + reason (STOP keyword, manual, etc.).</li>
            </ul>

            <p className="font-medium mt-3">Actions available per row</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Unsubscribe</strong> — sets <code>marketing_consent = false</code> and records the reason as <em>manual</em>. Receipts can still be sent (transactional), but no marketing SMS will go out.</li>
              <li><strong>Delete</strong> — hard-removes the row entirely. Use for data-subject deletion requests; otherwise prefer Unsubscribe so duplicate captures don&apos;t re-add a number that has previously asked to stop.</li>
              <li><strong>Export CSV</strong> — exports the current filtered view (number, consent, last receipt, receipts sent, status). Use this to seed an external campaign tool or to hand a curated list to your marketing manager.</li>
            </ul>

            <p className="font-medium mt-3">Automatic STOP / opt-out handling</p>
            <p>When you send any SMS to a subscriber (receipt or marketing) and they reply <strong>STOP</strong>, <strong>STOPALL</strong>, <strong>UNSUBSCRIBE</strong>, <strong>QUIT</strong>, <strong>END</strong> or <strong>CANCEL</strong>, Twilio flags the number and our inbound webhook flips the row to unsubscribed with reason <em>stop_keyword</em>. They will not receive further marketing or receipt SMS from your venue. Replying <strong>START</strong> re-opens the channel. This is required by Australian, US and UK SMS regulations — never re-add a STOPped number manually.</p>

            <p className="font-medium mt-3">Sending marketing SMS to this list</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Open <strong>Diners → Campaigns → New Campaign</strong>.</li>
              <li>Channel: <strong>SMS</strong>. Audience: choose the built-in segment <em>&quot;SMS subscribers — marketing opted-in&quot;</em>, or build a custom segment that includes <code>sms_subscribers</code> rows where <code>marketing_consent = true</code>.</li>
              <li>Compose the message (use the AI Composer for goal-driven copy). Include the venue name and an opt-out reminder — the platform auto-appends <em>&quot;Reply STOP to opt out&quot;</em> on the first send to a number and on the first send of each calendar month.</li>
              <li>Schedule respecting <strong>quiet hours</strong> (default 9pm–9am local) and the venue&apos;s daily SMS cap, both set in Settings → Marketing Guardrails.</li>
              <li>After send, the Campaigns Insights tab reports delivery, click-through (via tracking token), and attributed revenue from any orders placed in the following 7 days.</li>
            </ol>

            <p className="font-medium mt-3">Requirements to send real texts</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>A Twilio account connected via <strong>Settings → Integrations → Twilio</strong> (or the workspace-level Twilio connector). Required secrets: <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> and a sender — either <code>TWILIO_FROM_NUMBER</code> (long code / short code) or a Messaging Service SID.</li>
              <li><strong>SMS Pumping Protection</strong> and <strong>SMS Geo Permissions</strong> must be enabled in the Twilio console — only enable the destination countries you actually serve. This protects your account from fraudulent traffic that would otherwise be billed to you.</li>
              <li>If no Twilio credentials are configured, the system runs in <strong>simulated mode</strong>: receipts and marketing sends are still captured in <code>sms_subscribers</code> and Campaign logs (so you can preview consent capture and audience size), but no real text is delivered. A banner at the top of the SMS Subscribers tab shows the current mode.</li>
            </ul>

            <p className="font-medium mt-3">Compliance &amp; data hygiene</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Receipt SMS (transactional) is allowed without explicit marketing consent because the guest initiated it. Marketing SMS requires the opt-in tick — never repurpose a transactional row for marketing without it.</li>
              <li>Consent state, source and timestamp are stored on each row to satisfy Spam Act 2003 (AU), TCPA (US) and PECR/GDPR (UK/EU) record-keeping obligations.</li>
              <li>The list is venue-scoped. A guest who opts in at Venue A is not automatically opted in at Venue B, even within the same group.</li>
              <li>Numbers older than 24 months with no receipt activity and no marketing engagement should be reviewed and either re-permissioned or deleted. Use the CSV export + filter on <em>last receipt</em> to find them.</li>
            </ul>

            <p className="font-medium mt-3">Permissions</p>
            <p>Visibility of the SMS Subscribers tab and the Unsubscribe / Delete / Export actions is controlled by venue role permissions (Settings → Staff &amp; Roles → Permissions → <em>CRM &gt; SMS Subscribers</em>). Restrict Delete and Export to managers; allow Unsubscribe for floor staff who may handle a guest&apos;s in-person request to stop messages.</p>
          </SubSection>
        </Section>



        {/* POS Integration — H&L Exceed Web Orders */}
        <Section id="pos-integration" title="POS Integrations" icon={Plug} hidden={isHidden("pos-integration")}>
          <SubSection title="Supported POS providers">
            <p>The POS Integrations screen in the Admin Panel now lists five providers as connectable cards. <strong>H&L Exceed is the first card and the default</strong> for every new venue — the others exist for group sites running mixed estates or for pilots.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>H&L Exceed</strong> (default) — direct Web Orders API integration. Full order push, PLU mapping, status webhooks and refund acknowledgement. Everything below in this section describes this adapter.</li>
              <li><strong>Doshii</strong> — middleware connector for venues already brokering POS traffic through Doshii.</li>
              <li><strong>Lightspeed</strong> — order push and product pull for Lightspeed Restaurant sites.</li>
              <li><strong>Square</strong> — order push and catalogue pull for Square POS sites.</li>
              <li><strong>Mock Provider</strong> — a sandbox adapter that accepts and acknowledges every order. Use it to test the full order → POS → status flow without touching a real till.</li>
            </ul>
            <p>Each card shows connection status (Not connected / Connected / Error), a Connect button that opens the credentials dialog, and a Test Connection action. Only one provider can be active per venue at a time — connecting a second provider replaces the first.</p>
            <StepList steps={[
              "Admin → Integrations → POS. H&L Exceed appears first and is pre-selected.",
              "Click Connect on the provider your venue runs.",
              "Enter the credentials for that provider (API URL + key for H&L Exceed; provider-specific fields for the others).",
              "Hit Test Connection — green means the adapter authenticated and can reach the till.",
              "Enable Auto-push so paid orders queue to the POS within seconds.",
            ]} />
            <Tip>Start any new site on Mock Provider, place three test orders, confirm they show as pushed and acknowledged, then swap to the real provider. It separates 'our integration is broken' from 'your POS credentials are wrong' in about five minutes.</Tip>
          </SubSection>
          <SubSection title="What this integration does">

            <p>
              When a diner places an order through H&L OrderNOW, we can push that order straight into your H&L Exceed POS via the <strong>H&L Web Orders API</strong>. The order opens on the POS exactly as if a staff member had keyed it in — same docket, same PLUs, same tender, same table. No double-handling, no re-keying at end of service.
            </p>
            <p>
              This is opt-in per venue. Until it's switched on, orders stay in the H&L OrderNOW Orders screen only. Once on, every new order is queued for push within seconds of being placed, and you can manually push or refresh any order from the order card.
            </p>
            <p className="text-xs">
              Reference: <a className="underline" href="https://developer.hlpos.com/reference/addorder" target="_blank" rel="noreferrer">developer.hlpos.com/reference/addorder</a>
            </p>
          </SubSection>

          <SubSection title="How it works end-to-end">
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Diner checks out in H&L OrderNOW → order row is written to our database and charged via H&L Pay.</li>
              <li>A database trigger checks the venue's POS integration. If it's <em>connected</em> and <em>auto-push</em> is on, a <code>send_order</code> job is enqueued on our background worker.</li>
              <li>The worker fetches an OAuth bearer token from H&L (cached for ~24h), maps our order to the H&L Web Orders payload, and POSTs to <code>https://weborders.hlcloud.com.au/api/order</code>.</li>
              <li>H&L returns a success/failure. We write <code>pos_push_status</code>, <code>pos_pushed_at</code>, and any error back onto the order, and log the full request/response to <code>pos_sync_log</code>.</li>
              <li>The Orders screen shows a coloured POS badge per order (<em>queued / sent / error / failed</em>). Managers can tap <strong>Push to POS</strong> to retry or <strong>Refresh</strong> to pull current status from H&L by reference.</li>
            </ol>
          </SubSection>

          <SubSection title="Data we need from H&L (per venue)">
            <p>H&L assigns these per venue/site. Capture them once in <strong>Settings → Integrations → H&L POS → Configure</strong>:</p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="py-2 pr-3 pl-3 font-medium">Field</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 font-medium">What it's for</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2 pr-3 pl-3"><code>client_id</code></td><td className="py-2 pr-3">H&L (secret)</td><td className="py-2">OAuth2 client credentials — identifies our integration to H&L's auth server.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>client_secret</code></td><td className="py-2 pr-3">H&L (secret)</td><td className="py-2">OAuth2 secret. Stored encrypted; never displayed once saved.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>integrator_id</code></td><td className="py-2 pr-3">H&L</td><td className="py-2">Numeric ID H&L issues to identify H&L OrderNOW as the originating integrator on this site.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>recipient_id</code></td><td className="py-2 pr-3">H&L</td><td className="py-2">Numeric ID of the receiving POS/site within H&L's system. Routes our orders to the right venue.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>station_no</code></td><td className="py-2 pr-3">H&L / venue</td><td className="py-2">Logical station the order is keyed against (used for sales reporting and docket routing on the POS).</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>shared_secret</code></td><td className="py-2 pr-3">H&L (secret)</td><td className="py-2">HMAC-SHA256 key H&L uses to sign webhooks back to us (status updates). Required if you want async status reconciliation.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>default_tender_code</code></td><td className="py-2 pr-3">Venue choice</td><td className="py-2">PLU tender used for fast-tender orders (no table). Defaults to <code>63</code> = card.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3"><code>serving_type</code> / <code>interface_type</code></td><td className="py-2 pr-3">H&L / venue</td><td className="py-2">Optional flags for service style (dine-in, takeaway, etc.) and interface channel. Defaults to <code>0</code>.</td></tr>
                </tbody>
              </table>
            </div>
            <p>Server URLs (<code>oauth_token_url</code>, <code>oauth_audience</code>, <code>web_orders_base_url</code>) are pre-filled with H&L production defaults and only need to change for sandbox testing.</p>
          </SubSection>

          <SubSection title="Authentication (OAuth2 client credentials)">
            <p>
              On every push, the worker calls <code>POST https://auth.hlcloud.com.au/oauth/token</code> with the venue's <code>client_id</code>, <code>client_secret</code>, and <code>audience</code>, gets back a bearer token (valid ~24h), and caches it on the venue row. The next push reuses the cached token until ~5 min before expiry, then refreshes automatically. If H&L returns 401, we drop the cache and re-auth.
            </p>
          </SubSection>

          <SubSection title="Order mapping — what we send">
            <p>Each push to <code>POST /api/order</code> contains four blocks:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>header</strong> — <code>test</code> flag, <code>device_time</code>, generated <code>docket_no</code>, <code>integrator_id</code>, <code>recipient_id</code>, <code>station_no</code>, our order UUID as <code>reference</code>, and <code>table_no</code> when the diner is dining in.</li>
              <li><strong>sale_items</strong> — one entry per cart line: <code>plu</code> (from the menu item's <em>POS ID</em>), <code>price</code>, <code>qty</code>, <code>description</code> (notes), and <code>modifier_items</code> with their own PLUs and prices.</li>
              <li><strong>tenders</strong> — depends on the order mode (see below).</li>
              <li><strong>customer</strong> — diner's first name and mobile (when provided), used by H&L for guest charges and loyalty.</li>
            </ul>
            <p>
              <strong>Important:</strong> the <code>plu</code> we send is the value in the menu item's <em>POS ID</em> field (and the modifier's POS ID for modifiers). If a PLU is missing or wrong, H&L will reject the order. Keep POS IDs in sync with H&L Exceed's product file.
            </p>
          </SubSection>

          <SubSection title="The four order modes">
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li><strong>Fast tender (card)</strong> — no table, paid by H&L Pay. We send <code>tenders: [{`{ tendercode: 63, amount }`}]</code> (or whatever you've set as the default tender).</li>
              <li><strong>Charge to table</strong> — order has a <code>table_no</code>. We send <code>tenders: []</code> and H&L opens / appends to the table tab.</li>
              <li><strong>Guest charge (room/hotel)</strong> — payment method <em>guest_charge</em>. We send <code>tendercode: 15</code>.</li>
              <li><strong>Debtor charge (house account)</strong> — payment method <em>debtor</em>. We send <code>tendercode: 17</code> with the diner's <code>account_id</code>.</li>
            </ul>
          </SubSection>

          <SubSection title="Status reconciliation — webhooks + GET fallback">
            <p>
              When H&L's POS finishes a key step on a docket (accepted, voided, etc.) it can POST a webhook to our <code>pos-hl-webhook</code> endpoint. We verify the HMAC-SHA256 signature using the venue's <code>shared_secret</code> and update the matching order.
            </p>
            <p>
              As a safety net — webhooks can be missed if the POS loses internet, or skipped entirely during initial setup — we also support a manual <strong>Refresh</strong> button on every order. It calls <code>GET /api/order/{`{reference}`}</code> using our order UUID as the reference and writes the live H&L status back onto the order row.
            </p>
          </SubSection>

          <SubSection title="Setting it up (operator walkthrough)">
            <StepList steps={[
              "Get integrator_id, recipient_id, station_no, client_id, client_secret, and shared_secret from H&L for the venue.",
              "In H&L OrderNOW, go to Settings → Integrations and click Connect on H&L POS.",
              "Click Configure on the venue row to open the H&L panel.",
              "Paste in the credentials, set Station No and default tender (leave at 63 unless H&L says otherwise).",
              "Leave Test mode ON for the first push. Click Send test order — this fires a $0.01, PLU 1 test docket with test:true so H&L's environment knows to discard it.",
              "Confirm the request/response panel shows a 2xx and the docket appears on the H&L side.",
              "Flip Test mode OFF and toggle Auto-push orders to POS on. From this point, every new H&L OrderNOW order pushes automatically.",
              "Optionally give H&L the webhook URL (Settings → Integrations shows the per-venue webhook endpoint) so status updates flow back.",
            ]} />
          </SubSection>

          <SubSection title="Operating the integration day-to-day">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>The Orders page shows a POS badge on every order: <em>queued</em> (waiting for the worker), <em>sent</em> (accepted by H&L), <em>error</em> (push failed — see the error message), <em>failed</em> (retries exhausted).</li>
              <li><strong>Push to POS</strong> — manually queues a send for any order. Use this to retry after an error, or to push an order that was placed while auto-push was off.</li>
              <li><strong>Refresh</strong> — pulls current status for that order from H&L by reference. Useful when a webhook was missed or to confirm a docket landed.</li>
              <li>Full request/response logs for every push and webhook live in <code>pos_sync_log</code> and are visible under Settings → Integrations → Activity for troubleshooting.</li>
            </ul>
          </SubSection>

          <SubSection title="Troubleshooting">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="py-2 pr-3 pl-3 font-medium">Symptom</th>
                    <th className="py-2 pr-3 font-medium">Likely cause</th>
                    <th className="py-2 font-medium">Fix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2 pr-3 pl-3">Test order fails with 401</td><td className="py-2 pr-3">Bad client_id / client_secret, or wrong audience</td><td className="py-2">Re-paste credentials. Confirm audience matches H&L's environment.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3">400 &quot;invalid PLU&quot;</td><td className="py-2 pr-3">Menu item POS ID doesn't exist on H&L</td><td className="py-2">Update the POS ID on the item / modifier to match the H&L PLU.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3">Order accepted but never appears on docket printer</td><td className="py-2 pr-3">Wrong station_no for this site</td><td className="py-2">Confirm the station number with H&L and update under Configure.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3">Auto-push not firing</td><td className="py-2 pr-3">Toggle off, or integration status not Connected</td><td className="py-2">Turn auto-push back on under Configure; re-run Test connection.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3">Webhook signature errors in log</td><td className="py-2 pr-3">shared_secret mismatch</td><td className="py-2">Rotate the shared secret with H&L and re-save under Configure.</td></tr>
                  <tr><td className="py-2 pr-3 pl-3">Table order pushed but bill went to a different table</td><td className="py-2 pr-3">QR sticker on the wrong table</td><td className="py-2">Check Tables &amp; QR — the H&L <code>table_no</code> mirrors the table number the diner scanned.</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <Tip>Always send at least one test order (Test mode ON, <code>test:true</code> header) and confirm H&L's environment received it before flipping auto-push on for a live venue. The first real push is the riskiest one — verify it once and the rest just work.</Tip>
        </Section>

        {/* Test Cards */}
        <Section id="test-cards" title="Test Cards" icon={CreditCard} hidden={isHidden("test-cards")}>
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

        {/* Zones & Multiple Menus */}
        <Section id="zones-menus" title="Zones &amp; Multiple Menus" icon={Layers} hidden={isHidden("zones-menus")}>
          <SubSection title="What a Zone is">
            <p>A <strong>Zone</strong> is a trading area inside your venue — Public Bar, Bistro, Rooftop, Beer Garden, Gaming Lounge, Function Room. Zones used to be a free-text label typed onto a table. They are now first-class venue records that carry three things:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Identity</strong> — name, description, colour and display order. The colour is used on the Tables board and on the Open Tabs panel so staff can see at a glance where an order came from.</li>
              <li><strong>A menu</strong> — every zone serves exactly one menu. Several zones can share the same menu (e.g. Bar and Beer Garden both serving &quot;Bar Snacks&quot;), but a zone never serves two menus at once.</li>
              <li><strong>Payment rules</strong> — pay-on-order vs run-a-tab, optional card pre-auth and amount, maximum tab value, and whether split payments are allowed. See <em>Open Tabs &amp; Split Payments</em>.</li>
            </ul>
            <p>Zones live under <strong>Settings → Zones</strong> (the tile at the bottom right of the settings hub). The old standalone &quot;Open Tabs&quot; tile has been folded into the zone card — any tab settings you had before were carried across automatically.</p>
          </SubSection>

          <SubSection title="Creating and managing zones">
            <StepList steps={[
              "Settings → Zones → Add Zone.",
              "Name it exactly as your team refers to it on the floor (Public Bar, Bistro, Rooftop). This name appears on the Tables page dropdown and on order tickets.",
              "Optionally add a description and pick a colour.",
              "Under Menu, choose which menu this zone serves. If you only have one menu ('Main Menu'), leave it selected.",
              "Under Payments, choose Pay on order or Run a tab, then configure pre-auth / tab limit / split payments if tabs are on.",
              "Drag zones to reorder them — the order controls how they appear in every dropdown.",
              "Toggle a zone inactive when an area is closed for the season. Inactive zones disappear from the table dropdown but existing tables keep their assignment.",
            ]} />
            <Tip>Don't delete a zone that has tables attached — set it inactive instead. Deleting orphans the tables and their QR stickers keep pointing at a zone that no longer resolves to a menu.</Tip>
          </SubSection>

          <SubSection title="Assigning zones to tables and QR codes">
            <p>On the <strong>Tables</strong> page the Zone field is now a dropdown fed by your active zones (plus a &quot;No zone&quot; option) instead of free text. When you migrated, existing text zones such as &quot;Bar&quot; and &quot;Bistro&quot; were matched by name to the new zone records, so nothing was lost.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>QR codes are untouched.</strong> Changing a table's zone does <em>not</em> change its QR URL. Never reprint stickers after a zone change.</li>
              <li>When a diner scans a table QR, we look up that table's zone, load the zone's menu, and apply the zone's payment rules — all before the landing page renders.</li>
              <li>Tables with no zone fall back to the venue's default menu and pay-on-order.</li>
            </ul>
          </SubSection>

          <SubSection title="Multiple menus per venue">
            <p>A <strong>Menu</strong> is a container that owns its own categories and items — for example Bistro Menu, Bar Snacks, Rooftop Cocktails, Function Package. Everything you had before the change was moved into a single menu called <strong>Main Menu</strong>, assigned to every zone, so diners saw no difference on day one.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>A menu can be shared by several zones. A zone serves exactly one menu.</li>
              <li>Categories belong to a menu. An item belongs to a category, so it belongs to exactly one menu. To sell the same dish in two outlets, duplicate the item into the second menu (prices, modifiers and PLUs can then differ per outlet).</li>
              <li>Menus have their own <strong>schedule</strong>: active days plus a start and end time (e.g. Lunch 11:00–15:00). Item-level time frames still apply on top of the menu schedule — an item only shows if <em>both</em> windows are open.</li>
              <li>Menus can be deactivated without deleting them (useful for seasonal or event menus).</li>
            </ul>
          </SubSection>

          <SubSection title="Menu Builder — the zone / menu switcher">
            <p>At the top of <strong>Menu Builder</strong> there is a zone / menu switcher. Pick a zone to load the menu that zone serves, or browse by menu directly. Everything on the page below — categories, items, images, modifiers, display areas, pricing, reorder and the AI tools — operates on the selected menu only.</p>
            <StepList steps={[
              "Open Menu Builder. The switcher shows the current zone/menu at the top of the page.",
              "Choose a zone (e.g. Rooftop) or a menu (e.g. Bar Snacks).",
              "Add / rename / duplicate / delete menus from the same switcher. Duplicate copies every category and item — the fastest way to spin up a second outlet menu from your main one.",
              "Edit the menu schedule (active days, start/end time) from the switcher's menu settings.",
              "Add categories and items as normal — they attach to the selected menu automatically.",
            ]} />
            <Tip>Always confirm the switcher shows the right menu before you add items. Items added while &quot;Main Menu&quot; is selected will not appear to a diner sitting in a zone that serves &quot;Bar Snacks&quot;.</Tip>
          </SubSection>

          <SubSection title="Import, Enhance Images and Modifiers are menu-aware">
            <p>All three AI/admin tools now respect the selected menu:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Import Menu</strong> — the import writes categories and items into the menu currently selected in the switcher. Import a PDF while &quot;Bistro Menu&quot; is active and all 30-odd items land in the Bistro menu, not the Main Menu. If an import ever lands in the wrong place, switch to the correct menu and re-run, or move the categories.</li>
              <li><strong>Enhance Images / Generate Images</strong> — the batch counter and the queue are scoped to the items in the active menu, so &quot;31 items need images&quot; means 31 items <em>in this menu</em>.</li>
              <li><strong>Modifiers</strong> — the Modifiers page has a menu selector at the top. Modifier categories are reusable across menus, but the item list you attach them to is filtered to the selected menu.</li>
            </ul>
            <p>If items appear to be &quot;missing&quot; after an import, 99% of the time the switcher is on a different menu. Change the switcher before raising a support ticket.</p>
          </SubSection>

          <SubSection title="Worked example — an Australian pub">
            <p>Young &amp; Jackson-style setup:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Public Bar</strong> → menu &quot;Bar Snacks&quot; → tabs ON, pre-auth $50, tab limit $300, split payments ON.</li>
              <li><strong>Bistro</strong> → menu &quot;Bistro Menu&quot; (11:00–21:00 daily) → tabs ON, no pre-auth, split payments ON.</li>
              <li><strong>Rooftop</strong> → menu &quot;Rooftop&quot; → tabs OFF (pay on order), high-volume, no bill-chasing at close.</li>
            </ul>
            <p>Each table sticker points to a table; the table points to a zone; the zone decides the menu and how the diner pays. Nothing else needs to be configured per table.</p>
          </SubSection>
        </Section>

        {/* Open Tabs & Split Payments */}
        <Section id="open-tabs" title="Open Tabs &amp; Split Payments" icon={Receipt} hidden={isHidden("open-tabs")}>
          <SubSection title="Pay on order vs run a tab">
            <p>Every zone chooses when money is taken:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Pay on order</strong> (default) — the diner pays at checkout for each order. Simplest, zero risk, best for high-volume bars, rooftops and events.</li>
              <li><strong>Run a tab</strong> — orders accumulate against an open tab for the table and the diner settles once at the end. Best for bistros, fine dining and long bar sessions.</li>
            </ul>
            <p>This is set per zone under <strong>Settings → Zones → (zone) → Payments</strong>, so one venue can run tabs at the bar and the bistro while the rooftop stays pay-on-order.</p>
          </SubSection>

          <SubSection title="Zone payment settings explained">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Tabs enabled</strong> — turns the &quot;Start a tab&quot; option on for tables in this zone.</li>
              <li><strong>Require card pre-authorisation</strong> — optional. When on, the diner must authorise a card before the first item is sent to the kitchen. Nothing is captured up front; the hold is released or converted at settlement.</li>
              <li><strong>Pre-auth amount</strong> — the hold value (e.g. $50 or $100). Set it to roughly your average tab so the hold covers the bill without alarming diners.</li>
              <li><strong>Maximum tab amount</strong> — once the running total crosses this ceiling, the diner is prompted to settle before ordering more, and staff see the tab flagged on the Open Tabs panel.</li>
              <li><strong>Allow split payments</strong> — lets a table settle with multiple payments and multiple methods.</li>
            </ul>
          </SubSection>

          <SubSection title="The diner experience">
            <StepList steps={[
              "Diner scans the table QR. The zone's menu loads.",
              "If the zone runs tabs, they're offered 'Pay now' or 'Start a tab'.",
              "If pre-auth is required, they authorise a card (Apple Pay / Google Pay / card). The hold is placed, not charged.",
              "They order as many times as they like. Each order fires to the kitchen immediately and is added to the tab.",
              "A running bill is always visible from the diner app — every order, every line, tax, gratuity and the balance due.",
              "When they're done they tap 'Pay bill'. They can pay the whole balance, split it evenly across N people, or pay a custom amount.",
              "On full settlement the tab closes, the pre-auth hold is released, and a receipt (email or SMS) is issued.",
            ]} />
          </SubSection>

          <SubSection title="Split payments and mixed tenders">
            <p>When split payments are allowed, a bill can be settled with any combination of:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Card</strong>, <strong>Apple Pay</strong>, <strong>Google Pay</strong> — taken in the diner app via H&L Pay.</li>
              <li><strong>Gift card</strong> and <strong>Voucher / comp</strong> — applied against the balance with a reference label so it reconciles.</li>
              <li><strong>Cash</strong> — recorded by staff on the Open Tabs panel when the diner pays at the bar.</li>
              <li><strong>Loyalty points</strong> — redeemed against the balance at your configured rate.</li>
              <li><strong>Other</strong> — for anything unusual (house account, staff meal), always with a note.</li>
            </ul>
            <p>Split evenly divides the outstanding balance into equal shares and pushes any rounding remainder onto the first share, so the cents always add up to the exact total. Each payment is recorded separately with its method, amount, tip, payer label and timestamp — the tab is only closed when the balance reaches zero.</p>
          </SubSection>

          <SubSection title="The Open Tabs panel (staff view)">
            <p>Orders → <strong>Open Tabs</strong> shows every live tab in the venue: table, zone, tab label, number of orders, total ordered, total paid, balance due, pre-auth status and age. From here staff can:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Open a tab to see every order and every payment against it.</li>
              <li>Record a cash / gift card / voucher payment taken at the bar.</li>
              <li>Settle a tab on the diner's behalf (e.g. they hand over a card at the counter).</li>
              <li>See tabs that have hit their maximum amount, or that are open past close.</li>
            </ul>
            <Tip>Run the Open Tabs panel on the manager screen during service and clear it at close. A tab left open overnight can't be auto-settled — the pre-auth hold expires after ~7 days depending on the issuer.</Tip>
          </SubSection>

          <SubSection title="Security and reconciliation">
            <p>Tabs and tab payments are locked down by row-level security: a diner can only ever read their own table's tab through a scoped lookup, and staff functions (list open tabs, settle a tab) are restricted to authenticated venue staff. Every payment row carries the method, amount, tip, status and staff/diner attribution for end-of-day reconciliation, and flows into the same reporting and BAS exports as pay-on-order revenue.</p>
          </SubSection>
        </Section>

        {/* Pub+ Loyalty */}
        <Section id="pubplus" title="Pub+ Loyalty" icon={Gift} hidden={isHidden("pubplus")}>
          <SubSection title="What Pub+ is">
            <p><strong>Pub+</strong> is a group-wide loyalty programme modelled on the ALH Pub+ scheme. Unlike a standard venue loyalty programme, Pub+ is switched on at the <strong>parent (group) level</strong> and inherited by every child venue automatically. Members are shared across the whole group: a diner who joins at one hotel earns and redeems at every other hotel in the group, regardless of where they signed up.</p>
            <p>The difference to the ALH programme as it exists today: Pub+ currently requires a downloaded app and a barcode scan at the venue. In H&L OrderNOW the diner simply signs in (or joins) in the ordering app after scanning the table QR — no separate app, no barcode, points accrue on the order itself.</p>
          </SubSection>

          <SubSection title="Turning it on (group level)">
            <StepList steps={[
              "Open the Group dashboard and pick the parent company.",
              "Go to the Pub+ tab.",
              "Configure the programme: earn rate, tier thresholds, member benefits, join copy and branding.",
              "Activate. Every child venue immediately resolves Pub+ as its active loyalty programme — a Pub+ venue never runs a second local programme at the same time.",
              "Child venues can be viewed (but not overridden) from Admin → Venue → Pub+, so a site manager can see the rules their venue is inheriting.",
            ]} />
            <p>Under the hood, the active-programme lookup prioritises a Pub+ programme over any local venue programme, so enabling it at the parent is the single switch that rolls it out group-wide.</p>
          </SubSection>

          <SubSection title="Shared members and shared points">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Membership is held at the group, not the venue. One diner, one Pub+ balance.</li>
              <li>Points earned at Venue A are redeemable at Venue B with no transfer step.</li>
              <li>Visit history, tier and preferences follow the diner between sites, so the AI agent at a venue they've never visited still knows their favourites and dietary flags.</li>
              <li>Each venue still sees its own earn/redeem liability in reporting, so the group can settle inter-venue redemption internally.</li>
            </ul>
          </SubSection>

          <SubSection title="Diner sign-up flow">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Venue landing page</strong> — a Pub+ branded CTA replaces the generic loyalty CTA when Pub+ is active.</li>
              <li><strong>Diner sign-up</strong> — the sign-up form shows Pub+ benefits and joins the diner to the group programme in the same step.</li>
              <li><strong>Join prompt after ordering</strong> — non-members are offered Pub+ once their first order is paid, with the points they would have earned shown as the hook.</li>
              <li><strong>AI agent</strong> — the assistant can offer to enrol a diner mid-conversation and can apply a redemption when the balance covers an item in cart.</li>
            </ul>
          </SubSection>

          <SubSection title="Pub+ API integration (placeholder)">
            <p>The Pub+ programme we've built is <em>self-contained</em> — it does not yet talk to ALH's Pub+ platform. A placeholder integration card sits in the Admin Panel under <strong>Admin → Integrations → Pub+</strong>, ready for the real API: member lookup, points balance sync, earn/burn posting and tier reconciliation. Until credentials are issued, the card shows as not configured and all Pub+ activity stays inside H&L OrderNOW.</p>
            <Tip>When pitching to a group, run Pub+ end-to-end on a test parent company first: enable at parent, join as a diner at one child venue, order at a second child venue and show the shared balance. That demo is the whole value proposition in 90 seconds.</Tip>
          </SubSection>
        </Section>

        {/* Gratuities & Surcharges */}
        <Section id="surcharges" title="Gratuities &amp; Surcharges" icon={Percent} hidden={isHidden("surcharges")}>
          <SubSection title="Gratuities">
            <p>Settings → Payments → Gratuities controls the tip prompt the diner sees at checkout: whether tipping is offered at all, the suggested percentages (typically 5 / 10 / 15% in Australia), the default selection, and whether a custom amount is allowed. Tips are captured with the payment, reported separately from revenue, and settled with your normal payout.</p>
          </SubSection>

          <SubSection title="Surcharges">
            <p>Surcharges add a percentage (or fixed amount) to the order total for defined trading periods. Typical Australian use: a 10% Sunday surcharge and a 15% public-holiday surcharge, both disclosed to the diner before they pay.</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Name</strong> — shown on the diner's bill and the receipt (e.g. &quot;Public holiday surcharge&quot;). Be explicit; ACCC expects clear disclosure.</li>
              <li><strong>Rate</strong> — percentage of the order subtotal, or a fixed amount.</li>
              <li><strong>Days</strong> — which weekdays it applies on (e.g. Saturday and Sunday).</li>
              <li><strong>Time window</strong> — optional start/end time, for evening-only surcharges.</li>
              <li><strong>Active</strong> — turn a surcharge off without deleting its configuration.</li>
            </ul>
          </SubSection>

          <SubSection title="Custom dates — holidays and special events">
            <p>Weekday rules don't cover public holidays or one-off events, so every surcharge also accepts a list of <strong>special date ranges</strong>. A date range applies the surcharge on those dates regardless of which weekday they fall on.</p>
            <StepList steps={[
              "Settings → Payments → Surcharges → open the surcharge (or create one).",
              "Scroll to Special dates → Add date range.",
              "Enter a start date and an end date. Use the same date twice for a single day (e.g. 25 Dec – 25 Dec for Christmas Day).",
              "Give it a label so your team knows what it is ('Melbourne Cup', 'Australian Grand Prix', 'Boxing Day').",
              "Add as many ranges as you need — one surcharge can hold your whole public-holiday calendar plus event weekends.",
              "Save. The surcharge applies automatically on those dates with no one needing to remember to switch it on.",
            ]} />
            <p>Rules of thumb:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>A date range wins over the weekday rule — a date listed in special dates is always surcharged, even if that weekday isn't ticked.</li>
              <li>Multi-day events (Grand Prix weekend, a festival) are one range, not three separate ones.</li>
              <li>Load the next 12 months of public holidays for your state at the start of the financial year and you'll never miss one.</li>
              <li>Surcharges are calculated on the subtotal before gratuity and are shown as their own line on the bill and receipt.</li>
            </ul>
            <Tip>Diners are far more accepting of a surcharge they were told about before paying. The bill breakdown shows the surcharge line with its name — don't hide it inside item prices.</Tip>
          </SubSection>
        </Section>

        {/* Settings */}

        <Section id="settings" title="Settings" icon={Settings} hidden={isHidden("settings")}>
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
            <p>Loyalty in H&L OrderNOW is venue-configurable (or group-wide if you run multiple sites). Diners join from a Loyalty CTA on the Landing Page, from the AI chat (&quot;Want me to add you to our rewards?&quot;), or after their first paid order. Once joined, their points/stamps/tier sit in their diner profile and unlock automatically at checkout.</p>

            <p className="font-semibold mt-3">Programme types</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Points</strong> — earn N points per dollar spent (default 1pt = $1). Diners redeem points for credit at a configurable rate (e.g. 100pts = $5 off). Best for venues with frequent visits and varied basket sizes.</li>
              <li><strong>Stamps</strong> — punch-card style. Earn one stamp per visit / per qualifying item; redeem a full card for a free item or discount. Best for cafes, takeaway, single-item venues.</li>
              <li><strong>Tier-based</strong> — diners climb tiers (e.g. Silver → Gold → Black) based on rolling 12-month spend. Each tier unlocks perks: priority service, % discount, free item on birthday, exclusive specials in the AI chat. Best for restaurants with regulars and a hospitality-led brand.</li>
            </ul>

            <p className="font-semibold mt-3">Setting up a programme</p>
            <StepList steps={[
              "Settings → Loyalty → Enable Loyalty.",
              "Pick a programme type (Points / Stamps / Tier).",
              "Configure earn rules: Points = points per $1; Stamps = how a stamp is earned (per visit, per qualifying item); Tier = annual spend thresholds.",
              "Configure redemption: Points = redemption rate ($ value per 100pts) and minimum balance to redeem; Stamps = stamps per reward and the reward itself; Tier = perks per tier.",
              "Set expiry: points/stamps can expire after N months of inactivity. Recommended 12 months for points, 6 for stamps. Tiers reset annually based on rolling spend.",
              "Customise the join prompt: heading, description, and the CTA the agent uses in chat.",
              "Toggle the programme Active. Existing diners are auto-enrolled if their orders qualify; new diners are prompted on first visit.",
            ]} />

            <p className="font-semibold mt-3">Group loyalty (multi-venue)</p>
            <p>If your venue is part of a group, the Group Loyalty Manager in the Group dashboard lets you run a single programme across all sites. Diners earn at any venue, redeem at any venue, and the parent controls the rules. Child venues can opt in or run their own local programme — never both.</p>

            <p className="font-semibold mt-3">Diner-facing prompts</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Join prompt</strong> — appears after a successful first order if the diner isn't already a member.</li>
              <li><strong>Tier-up notification</strong> — push + in-app banner when a diner crosses a tier threshold.</li>
              <li><strong>Redemption nudge</strong> — AI agent proactively offers to apply a redemption when the diner has enough balance and an eligible item is in cart.</li>
              <li><strong>Birthday reward</strong> — auto-issued on the diner's birthday (requires birthday on file from the CRM profile).</li>
            </ul>

            <p className="font-semibold mt-3">CRM integration</p>
            <p>Loyalty tier and balance are first-class fields in the CRM Segments builder. Build segments like &quot;Gold tier, &gt;30 days since last visit&quot; and target them with a win-back campaign in one click.</p>

            <Tip>Don't over-discount. A 1pt-per-$1 programme redeeming at 100pts = $5 is a 5% effective margin hit on engaged regulars — pricier than most loyalty operators realise. Model the cost before you launch.</Tip>
          </SubSection>
          <SubSection title="H&L OrderNOW AI">
            <p>The H&L OrderNOW AI settings let you shape the personality, voice, and guardrails of your venue's AI dining assistant. Done well, the agent feels like a knowledgeable host who knows your menu cold. Done badly, it feels like a generic chatbot.</p>

            <p className="font-semibold mt-3">Identity</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Agent Name</strong> — how the agent introduces itself (e.g. &quot;Ollie&quot;, &quot;Sippa&quot;, &quot;Your Sommelier&quot;). Give it a name that fits your brand.</li>
              <li><strong>Agent Icon</strong> — custom avatar shown next to every message. Upload a square PNG/SVG, ideally with transparent background. Falls back to the H&L OrderNOW default.</li>
              <li><strong>Opening Message</strong> — the first thing every diner sees. Keep it warm, short, and end with a question that invites the next message (e.g. &quot;G'day! Welcome to Bondi Bistro. Are you here for a quick bite or a longer dinner tonight?&quot;).</li>
            </ul>

            <p className="font-semibold mt-3">Tone presets</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Casual</strong> — friendly, contractions, light banter. Great for cafes, pubs, casual diners.</li>
              <li><strong>Professional</strong> — polished, no slang, structured suggestions. Great for fine dining, hotels.</li>
              <li><strong>Playful</strong> — emoji, jokes, energetic recommendations. Great for cocktail bars, dessert venues, novelty concepts.</li>
            </ul>

            <p className="font-semibold mt-3">Venue Context (the most important field)</p>
            <p>A free-text box where you tell the AI everything a new staff member would need to know: cuisine, signature dishes, sourcing philosophy, BYO policy, kid-friendliness, dietary handling, parking, history. The agent draws on this to answer diner questions and make recommendations that <em>sound like your venue</em>.</p>
            <p>Good example:</p>
            <p className="font-mono text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap">{`Modern Australian bistro in Bondi, opened 2018.
Seafood-forward, native ingredients (saltbush, finger lime, davidson plum).
Signature: snapper crudo with finger lime. Hero dessert: burnt basque cheesecake.
Wine list is small-producer Aussie + NZ; cocktails lean low-ABV.
BYO is fine on Mon/Tue ($15 corkage).
Kid menu available on request.
GF is well-handled; DF on most dishes; nut-free kitchen.`}</p>

            <p className="font-semibold mt-3">Guardrails</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Max discount %</strong> — the agent will never offer a discount above this (default 0%). Raise it only if you want the AI to proactively offer Happy Hour or win-back deals.</li>
              <li><strong>Quiet hours</strong> — outbound AI nudges (CRM Instant Campaigns) won't fire in this window.</li>
              <li><strong>Daily send cap</strong> — max AI-initiated messages per diner per day.</li>
              <li><strong>Require approval</strong> — if on, every AI-drafted campaign waits for a human to approve before sending.</li>
            </ul>

            <p className="font-semibold mt-3">Testing the agent</p>
            <StepList steps={[
              "Open your venue's QR URL in a private browser window (so you're not logged in).",
              "Scan or paste a real table QR.",
              "Have a full conversation — ask for a recommendation, request a modifier, ask about allergens.",
              "If anything sounds off, edit the Venue Context first (it has the biggest impact), then the Opening Message, then the tone preset last.",
              "Re-test in a fresh private window.",
            ]} />

            <Tip>If diners ask the agent the same question repeatedly (e.g. &quot;do you have parking?&quot;), add the answer to Venue Context — the agent will start answering it confidently first time.</Tip>
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
            <p>Tax rules let you configure how GST (or international equivalents) is collected and displayed. For Australian venues, the default is a single 10% GST rule marked <em>inclusive</em> — i.e. the price you set in Menu Builder already contains GST, exactly as required for diner-facing pricing under the ACCC.</p>

            <p className="font-semibold mt-3">Tax types</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Percentage</strong> — e.g. 10% GST. The most common type.</li>
              <li><strong>Fixed</strong> — flat amount per order. Use sparingly (e.g. a small statutory levy).</li>
              <li><strong>Compound</strong> — calculated on top of subtotal <em>plus</em> another tax (e.g. PST on top of GST in Canadian provinces). Order matters; the compound rule runs after the base it references.</li>
            </ul>

            <p className="font-semibold mt-3">Inclusive vs exclusive (worked example)</p>
            <p>For a $22 burger with 10% GST:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Inclusive</strong> (Australian default): diner sees $22.00 on the menu and pays $22.00. The GST component is $2.00 ($22 × 1/11) and the net price is $20.00. The receipt shows both lines.</li>
              <li><strong>Exclusive</strong>: diner sees $22.00 on the menu but pays $24.20 at checkout ($22 + $2.20 GST). Standard in the US; <em>not compliant for Australian dine-in pricing</em>.</li>
            </ul>

            <p className="font-semibold mt-3">Setting up a tax rule</p>
            <StepList steps={[
              "Settings → Taxes → Add Tax Rule.",
              "Name it (e.g. 'GST').",
              "Pick type (Percentage / Fixed / Compound) and enter the rate.",
              "Set inclusive vs exclusive — Australian venues should always use Inclusive for GST.",
              "Scope: All items, specific Category, or specific Items. Most venues only need one all-items rule.",
              "Activate. Existing menu prices are not changed — only how tax is computed and displayed.",
            ]} />

            <p className="font-semibold mt-3">Receipts and POS push</p>
            <p>The diner receipt shows the subtotal, each tax line, and the total. The POS Integration push sends the inclusive price as the line PLU price (H&L Exceed's expected behaviour). Tax breakdowns are recorded on every order in the audit trail for BAS reporting.</p>

            <p className="font-semibold mt-3">Per-category exemptions</p>
            <p>Some items can be GST-free in Australia (e.g. basic groceries for retail venues). To handle this, create a second tax rule with rate 0% scoped to those categories, and leave the global 10% rule scoped to <em>All items except</em> those categories. Speak to your accountant before changing GST handling.</p>

            <Tip>BAS exports live in Analytics → Exports. The CSV contains every order's net, GST, and gross broken out by tax rule so your bookkeeper can reconcile straight into Xero / MYOB.</Tip>
          </SubSection>
          <SubSection title="Landing Page Editor">
            <p>The Landing Page Editor controls the public-facing page a diner sees the instant they scan your QR sticker — <em>before</em> they start chatting with the AI agent. A good landing page sets the brand tone, confirms they're at the right venue (with their table number), highlights specials, and pushes loyalty sign-up.</p>

            <p className="font-semibold mt-3">Opening the editor</p>
            <p>Settings → Landing Page → <strong>Open Landing Page Editor</strong>. The editor takes over the screen with a three-pane layout:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Left rail — Sections.</strong> A pinned <em>Page Theme</em> entry at the top, then your draggable list of sections (Hero, Featured Items, Loyalty CTA, etc.). Click any row to edit it on the right; drag the handle to reorder; the trash icon deletes it.</li>
              <li><strong>Middle — Mobile preview.</strong> A live phone-frame rendering of exactly what diners will see. Updates instantly as you edit.</li>
              <li><strong>Right — Edit panel.</strong> Shows the Theme panel or the selected section's properties, depending on what's selected.</li>
            </ul>
            <p>Top bar buttons: <strong>← Back</strong> returns to Settings without saving, <strong>Build from website</strong> opens the AI generator, <strong>Save &amp; Publish</strong> pushes your changes live.</p>

            <p className="font-semibold mt-3">Build from website (AI)</p>
            <p>The fastest way to get a real landing page is to let AI build one from your existing restaurant website. Click <strong>Build from website</strong> in the top bar:</p>
            <StepList steps={[
              "Paste your existing site URL (e.g. https://yourrestaurant.com).",
              "Choose Replace current sections (recommended on first run) or Append to current sections.",
              "Click Generate. The status line shows progress: Scraping site → Analysing branding → Looking up address → Composing sections.",
              "When it finishes you'll see new sections drop into the left rail and (in Replace mode) a fresh theme applied. The mobile preview updates instantly.",
              "Click Save & Publish to keep the result. If you don't save, none of it sticks.",
            ]} />
            <p>What the AI extracts from your site: brand colours (page background, accent), heading and body fonts (matched to the closest Google Font), a hero title and subtitle, your address, opening hours, social links, and up to ~4 featured items if it can find a menu. Anything it can't find is left blank for you to fill in.</p>

            <p className="font-semibold mt-3">Page Theme</p>
            <p>The Theme panel sets the colours and fonts every section inherits. Individual sections can still override any colour. Fields:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Page Background</strong> — accepts a hex colour (<code>#1a1a2e</code>) <em>or</em> a full CSS expression like <code>linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)</code>. Gradients land brand atmosphere without uploading an image.</li>
              <li><strong>Accent</strong> — drives the table number colour, CTA buttons, and links.</li>
              <li><strong>Surface</strong> — fill for cards/panels inside sections (use a semi-transparent value like <code>rgba(255,255,255,0.08)</code> over a dark background).</li>
              <li><strong>Border</strong> — subtle dividers and card outlines.</li>
              <li><strong>Primary Text</strong> / <strong>Muted Text</strong> — headings/body and secondary text.</li>
              <li><strong>Heading Font</strong> / <strong>Body Font</strong> — pick from the curated Google Fonts list (Inter, Playfair Display, Bebas Neue, DM Sans, etc.). The preview renders the dropdown items in the font itself.</li>
            </ul>

            <p className="font-semibold mt-3">Section types — what each one does</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>🏠 Hero</strong> — big welcome header with title, subtitle, optional logo emoji, and optional hero image (with adjustable overlay opacity for text contrast). This is the first thing diners see — keep the title short and the subtitle action-oriented (&quot;Scan, order, enjoy — no app needed&quot;).</li>
              <li><strong>🪑 Table Number</strong> — shows the diner's assigned table in large type. Drawn from the QR they scanned; the page reads it automatically. Customisable label, number colour, background, border. Skip this on take-away-only menus.</li>
              <li><strong>⭐ Featured Items</strong> — a styled card grid of up to ~6 dishes (emoji, name, price). Use it for today's specials, signature dishes, or seasonal items. This is <em>display only</em> — diners still order via the AI agent, not from this card.</li>
              <li><strong>🎁 Loyalty CTA</strong> — sign-up prompt for your loyalty programme. Two variants: <em>Text</em> (icon + headline + button) or <em>Image</em> (full-bleed image + overlay text). Configure heading, description, CTA label and URL, and all the colours. Cross-link to the Loyalty section for setup.</li>
              <li><strong>📍 Hours &amp; Location</strong> — address, opening hours, and an optional embedded map (Google Maps URL). Pre-filled by Build from website when it can find them.</li>
              <li><strong>📱 Social Links</strong> — Instagram, Facebook, Google handles. Leave a field empty to hide that icon.</li>
              <li><strong>📝 Text</strong> — free-form paragraph for an &quot;About&quot; blurb, allergy notice, or BYO policy. Align left / centre / right, weight normal / medium / bold.</li>
              <li><strong>➖ Divider</strong> — thin horizontal rule between sections. Colour and thickness configurable.</li>
              <li><strong>↕️ Spacer</strong> — vertical breathing room (height in pixels). Use for visual rhythm between dense sections.</li>
            </ul>

            <p className="font-semibold mt-3">Building a section</p>
            <StepList steps={[
              "Click the + button at the top of the left rail to open the Add Section modal.",
              "Pick a section type. It drops in at the bottom of the list and is auto-selected.",
              "Edit its fields in the right panel — every change is reflected immediately in the mobile preview.",
              "Drag the row in the left rail to move it up or down.",
              "Use the trash icon on a row to delete a section.",
              "When you're happy, click Save & Publish.",
            ]} />

            <p className="font-semibold mt-3">Mobile preview</p>
            <p>The middle pane is locked to phone width because <em>~95% of diners hit your landing page on a phone</em> via the QR scan. Design for that frame first. The preview is interactive — scroll inside it to test long pages.</p>

            <p className="font-semibold mt-3">Save &amp; Publish</p>
            <p>There is no separate draft / publish step — <strong>Save &amp; Publish</strong> writes the new payload to your venue immediately, and the next diner who scans gets the new page. Permanent QR codes don't change. Roll back by editing again and clicking Save.</p>

            <Tip>If you've just run <strong>Build from website</strong> and don't like the result, you can either tweak it section-by-section, or run it again with a different URL (or in Append mode to layer extra sections onto a hand-built page). Nothing is saved until you click Save &amp; Publish, so it's safe to experiment.</Tip>
          </SubSection>
        </Section>

        <Separator />
        <p className="text-xs text-muted-foreground text-center pb-8">
          Need more help? Contact us at support@hlordernow.com
        </p>
      </div>
    </div>
  </div>
  );
}
