import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { HeroSection } from "@/components/marketing/HeroSection";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { CtaBand } from "@/components/marketing/CtaBand";
import {
  Sparkles,
  CreditCard,
  Users,
  Gift,
  LayoutGrid,
  Beer,
  Wallet,
  Percent,
  Plug,
  QrCode,
  ChefHat,
  BarChart3,
} from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "Agentic AI ordering",
    description: "Spark replaces the traditional menu with an intent-driven conversation. Diners say what they want, and the AI builds the order.",
    bullets: ["Chat-first or TikTok-style feed", "Modifier and dietary guardrails", "Auto-suggest upsells with revenue attribution"],
  },
  {
    icon: BarChart3,
    title: "AI co-pilot for managers",
    description: "A daily operations assistant that recommends specials, staffing, and campaigns based on live data.",
    bullets: ["Daily specials & contests", "Birthday blasts and win-back offers", "AI revenue attribution tile"],
  },
  {
    icon: CreditCard,
    title: "H&L Pay",
    description: "Built-in PayFac designed for Australian hospitality, with surcharging compliance and one settlement.",
    bullets: ["Apple Pay, Google Pay, stored cards", "3D Secure 2 & manual/auto capture", "Single statement for the venue"],
  },
  {
    icon: Wallet,
    title: "Open Tabs & split bills",
    description: "Let guests run a tab at the bar or table, then settle in-app with split payments across cards and gift cards.",
    bullets: ["Per-zone tab settings", "Optional card pre-authorisation", "Split payment methods on one bill"],
  },
  {
    icon: Users,
    title: "Diner CRM & Loyalty",
    description: "Capture birthdays, segment diners by RFM, and run multi-channel campaigns that attribute back to revenue.",
    bullets: ["Birthday capture at signup", "RFM & AI lookalike segments", "Email / SMS / Push / In-app"],
  },
  {
    icon: Gift,
    title: "Pub+ Group Loyalty",
    description: "Parent-level loyalty programs shared across every child venue. Members earn and redeem anywhere in the group.",
    bullets: ["Turn on at the parent level", "Shared member database", "Eagle Eye AIR integration placeholder"],
  },
  {
    icon: LayoutGrid,
    title: "Zones & Multi-Menus",
    description: "Build zones like Rooftop Bar, Bistro, and Main Bar, then assign menus, payment modes, and service modes per zone.",
    bullets: ["Multiple menus per venue", "Zone-based QR codes", "Per-zone payment and service mode overrides"],
  },
  {
    icon: Percent,
    title: "Surcharges & Special Dates",
    description: "Apply weekend or holiday surcharges automatically, including custom event dates like the Grand Prix.",
    bullets: ["Time-based rules", "Custom date ranges", "Transparent diner disclosure"],
  },
  {
    icon: Plug,
    title: "POS Integrations",
    description: "Native H&L Exceed is the default, with adapters for Doshii, Lightspeed, Square, and a mock provider for testing.",
    bullets: ["H&L Exceed first & default", "Menu sync & order throttling", "Real-time status and webhook handling"],
  },
  {
    icon: QrCode,
    title: "Permanent QR Stickers",
    description: "QR codes use stable UUIDs and never change. Print them once and keep them for the life of the table.",
    bullets: ["Stable URLs", "No re-printing", "Works with any phone"],
  },
  {
    icon: ChefHat,
    title: "Kitchen Pacing & Throttling",
    description: "Throttle orders during peak periods and pace kitchen load so service never breaks down.",
    bullets: ["Surge controls", "Order pacing", "Offline-tolerant QR codes"],
  },
  {
    icon: BarChart3,
    title: "AI Revenue Attribution",
    description: "Track every order influenced by AI into a single revenue tile so you can prove the ROI.",
    bullets: ["Upsell attribution", "Campaign attribution", "Network-wide reporting"],
  },
];

export default function Features() {
  return (
    <MarketingLayout>
      <HeroSection
        headline="Every feature built for the floor."
        subheadline="From QR ordering to AI campaigns, group loyalty, open tabs, and native POS integrations — everything works as one platform."
        cta={{ label: "Book a demo", href: "mailto:sales@hl-ordernow.com?subject=Book%20a%20demo" }}
      />

      <section id="platform" className="py-20 lg:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Platform overview</h2>
            <p className="text-muted-foreground text-lg">
              One account, one platform, one revenue stack.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.slice(0, 6).map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section id="ai" className="py-20 lg:py-28 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">AI & Spark</h2>
            <p className="text-muted-foreground text-lg">
              The agentic layer that makes ordering faster, campaigns smarter, and managers more effective.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.filter((f) => ["Agentic AI ordering", "AI co-pilot for managers", "AI Revenue Attribution"].includes(f.title)).map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section id="hlpay" className="py-20 lg:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">H&L Pay</h2>
            <p className="text-muted-foreground text-lg">
              Built-in payments with the compliance and localisation Australian venues need.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.filter((f) => ["H&L Pay", "Open Tabs & split bills"].includes(f.title)).map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section id="crm" className="py-20 lg:py-28 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Diner CRM & Loyalty</h2>
            <p className="text-muted-foreground text-lg">
              Turn every order into a relationship, and every relationship into repeat revenue.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.filter((f) => ["Diner CRM & Loyalty", "Pub+ Group Loyalty"].includes(f.title)).map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Operations & Reliability</h2>
            <p className="text-muted-foreground text-lg">
              The backend features that keep service running when the venue is full.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.filter((f) => ["Zones & Multi-Menus", "Surcharges & Special Dates", "POS Integrations", "Permanent QR Stickers", "Kitchen Pacing & Throttling"].includes(f.title)).map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        headline="See the full platform in a live demo."
        subheadline="We'll walk through a real order flow, from QR scan to AI upsell and settlement."
      />
    </MarketingLayout>
  );
}
