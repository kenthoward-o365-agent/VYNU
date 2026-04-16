import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  BookOpen, LayoutDashboard, UtensilsCrossed, Tag, QrCode, ClipboardList,
  TrendingUp, Users, Settings, BarChart3, ChevronRight, Rocket, Sparkles,
  SlidersHorizontal, Gift, Bot, CreditCard, Receipt, FileText, Menu, X
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
              "Configure your payment gateway in Settings → Payments.",
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
          <SubSection title="Order Lifecycle">
            <p>Orders flow through these statuses:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li><strong>Received</strong> — Order placed by diner.</li>
              <li><strong>Preparing</strong> — Kitchen is working on it.</li>
              <li><strong>Ready</strong> — Food is ready for service.</li>
              <li><strong>Served</strong> — Delivered to the table.</li>
              <li><strong>Paid</strong> — Payment completed.</li>
              <li><strong>Cancelled</strong> — Order was cancelled.</li>
            </ol>
          </SubSection>
          <SubSection title="Managing Orders">
            <p>Click on any order to view full details including items, modifiers, customer notes, and table number. Use the status buttons to advance orders through the workflow.</p>
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
          <SubSection title="Users">
            <p>Invite and manage staff accounts. Assign roles:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>Owner</strong> — Full access to all settings and data.</li>
              <li><strong>Manager</strong> — Can manage menu, orders, and view analytics.</li>
              <li><strong>Staff</strong> — Can view and manage orders.</li>
            </ul>
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
          <SubSection title="Payments">
            <p>OrdrPayments is OrdrUp's built-in payment processing. No third-party accounts or API keys needed — just toggle it on in Settings → Payments and you're ready to accept payments. Use test mode to verify your flow before going live.</p>
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