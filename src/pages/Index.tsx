import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { HeroSection } from "@/components/marketing/HeroSection";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { CtaBand } from "@/components/marketing/CtaBand";
import { ComparisonGrid } from "@/components/marketing/ComparisonGrid";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Sparkles,
  CreditCard,
  Users,
  Gift,
  Zap,
  Shield,
  QrCode,
  Clock,
} from "lucide-react";

const products = [
  {
    icon: Sparkles,
    title: "AI Ordering",
    description: "Spark lets diners order by intent, not by menu. Chat, suggest, upsell, and remember preferences.",
    bullets: ["Conversational ordering", "Auto upsells & modifiers", "Allergen & dietary guardrails"],
  },
  {
    icon: CreditCard,
    title: "H&L Pay",
    description: "Built-in PayFac with Apple Pay, Google Pay, stored cards, and AU surcharging compliance.",
    bullets: ["Single settlement & statement", "3D Secure 2 support", "No third-party handoff"],
  },
  {
    icon: Users,
    title: "Diner CRM",
    description: "Capture birthdays, build RFM segments, and launch AI lookalike campaigns across channels.",
    bullets: ["Birthday capture at signup", "Email / SMS / Push / In-app", "Suppression & STOP handling"],
  },
  {
    icon: Gift,
    title: "Group Loyalty",
    description: "Pub+ style group loyalty that works across every child venue, with shared points and rewards.",
    bullets: ["Parent-level programs", "Shared members across venues", "Points accepted everywhere"],
  },
];

const proofPoints = [
  { value: "Weekend", label: "Live in a weekend" },
  { value: "Permanent", label: "QR sticker URLs" },
  { value: "AUD", label: "Local data & support" },
  { value: "No lock-in", label: "Pay per order" },
];

export default function MarketingIndex() {
  return (
    <MarketingLayout>
      <HeroSection
        headline="The agentic ordering platform that pays for itself by Friday."
        subheadline="H&L OrderNOW turns every QR scan into a conversation, every order into revenue, and every diner into a regular."
        cta={{ label: "Book a demo", href: "mailto:sales@hl-ordernow.com?subject=Book%20a%20demo" }}
        secondaryCta={{ label: "See how it compares", href: "/compare" }}
      />

      {/* Logo bar */}
      <section className="border-b border-border/60 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-center text-sm text-muted-foreground mb-8">
            Trusted by Australian hospitality groups
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12 opacity-60">
            {["Group A", "Group B", "Group C", "Group D", "Group E", "Group F"].map((group) => (
              <div
                key={group}
                className="h-8 px-4 flex items-center justify-center bg-foreground/5 rounded text-sm font-semibold text-foreground/70"
              >
                {group}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* One platform, four products */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              One platform, four products
            </h2>
            <p className="text-muted-foreground text-lg">
              Replace the menu, the wait, and the guesswork with AI ordering, built-in payments, diner CRM, and group loyalty.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {products.map((product) => (
              <FeatureCard key={product.title} {...product} />
            ))}
          </div>
        </div>
      </section>

      {/* AI revenue proof band */}
      <section className="bg-foreground text-background py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-background/70 text-sm uppercase tracking-wide mb-2">Across the network</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            AI-attributed revenue this month
          </h2>
          <p className="mt-4 text-background/60 text-lg">
            Every AI-suggested item, upsell, and campaign tracked back to one tile.
          </p>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6">
            {proofPoints.map((point) => (
              <div key={point.label} className="border border-background/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-primary">{point.value}</div>
                <div className="text-sm text-background/60 mt-1">{point.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Works alone / better together */}
      <section className="py-20 lg:py-28 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Works alone. Better together.</h2>
            <p className="text-muted-foreground text-lg">
              Run H&L OrderNOW standalone, or plug it straight into H&L POS for a unified stack.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-background rounded-2xl border border-border/60 p-8">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Standalone</h3>
              <p className="text-muted-foreground text-sm">
                No POS required. Get live with QR ordering, payments, and loyalty in one weekend.
              </p>
            </div>
            <div className="bg-background rounded-2xl border border-border/60 p-8">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <Zap className="h-5 w-5 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">With H&L POS</h3>
              <p className="text-muted-foreground text-sm">
                Native integration, shared menu sync, and unified reporting across the H&L ecosystem.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison teaser */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Built for AU hospitality. Benchmarked against the category.</h2>
            <p className="text-muted-foreground text-lg">
              See the side-by-side feature comparison against me&u, Mr Yum, Chewzie, and Square/Toast.
            </p>
          </div>
          <ComparisonGrid />
          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link to="/compare">See full comparison</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="py-16 bg-muted/30 border-y border-border/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-6 lg:gap-10">
            {[
              { icon: Shield, label: "PCI DSS SAQ-A" },
              { icon: Clock, label: "AU Support Hours" },
              { icon: Users, label: "WCAG 2.2 AA" },
              { icon: Sparkles, label: "SOC 2 in progress" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <item.icon className="h-4 w-4 text-primary" />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        headline="Live in a weekend. Book a 20-minute demo."
        subheadline="See how H&L OrderNOW fits your venue, group, or POS stack."
      />
    </MarketingLayout>
  );
}
