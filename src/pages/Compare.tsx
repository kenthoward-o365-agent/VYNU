import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { HeroSection } from "@/components/marketing/HeroSection";
import { ComparisonGrid } from "@/components/marketing/ComparisonGrid";
import { CompetitorProfiles } from "@/components/marketing/CompetitorProfiles";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowLeft, Bot, CreditCard, Users, Layers } from "lucide-react";

const decidingFactors = [
  {
    icon: Bot,
    title: "Agentic ordering, not a digital menu",
    body: "Every competitor renders a menu on a phone. OrderNOW takes the diner's intent — budget, cravings, allergies, table size — and builds the order, upselling on margin as it goes. It is the only row on the grid where nobody else has a tick.",
  },
  {
    icon: CreditCard,
    title: "H&L Pay is built in, not brokered",
    body: "Ordering platforms that hand checkout to a third-party acquirer cannot own the money flow. H&L Pay means one statement, one settlement, AU-compliant surcharging with special-date rules, and chargebacks handled in the same dashboard.",
  },
  {
    icon: Users,
    title: "Group loyalty that actually shares members",
    body: "Turn loyalty on at the parent company and every child venue inherits it. One member, one balance, earn and burn at any site — including a native Pub+ / Eagle Eye AIR connector. Competing platforms scope loyalty to a single venue.",
  },
  {
    icon: Layers,
    title: "Built for the shape of an Australian pub",
    body: "Zones give the public bar, bistro, gaming lounge and rooftop their own menu, payment timing and service mode. Throttling paces the kitchen. QR stickers never get reprinted. That is AU venue reality, not a US template.",
  },
];

const evaluationQuestions = [
  "Can the platform take an order from intent — \"something spicy, no dairy, under $30\" — without the diner browsing a menu?",
  "Can it show you, in dollars, what its AI earned you last month?",
  "Does loyalty follow the member across every venue in the group, or stop at the door?",
  "Is payment part of the platform, or handed off to a processor at checkout?",
  "Can a single venue run four different service models by area, from one dashboard?",
  "Will it run standalone today and integrate natively with H&L POS tomorrow?",
  "Is the data hosted in Australia, and is support in your trading hours?",
  "Do you pay a licence whether or not an order is taken?",
];

export default function Compare() {
  return (
    <MarketingLayout>
      <HeroSection
        headline="Built for AU hospitality groups. Benchmarked against the category."
        subheadline="An honest, capability-by-capability comparison of VYNU against me&u, Mr Yum, Chewzie and Square/Toast Order & Pay — with the caveats written in."
        cta={{ label: "Book a side-by-side demo", href: "mailto:sales@hl-ordernow.com?subject=Side-by-side%20demo" }}
        secondaryCta={{ label: "See the features", href: "/features" }}
      />

      {/* Deciding factors */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <Button variant="ghost" asChild className="mb-6 -ml-4">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to home
              </Link>
            </Button>
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              Four rows decide most evaluations
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The full grid below runs to nearly thirty capabilities, but in every group evaluation we've run,
              the decision lands on the same four.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {decidingFactors.map((f) => (
              <Card key={f.title} className="border border-border/60">
                <CardContent className="p-6 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Competitor profiles */}
      <section className="py-16 lg:py-24 bg-muted/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Who you're really comparing</h2>
            <p className="text-muted-foreground leading-relaxed">
              Each of these platforms is genuinely good at something. We've written what they do well before
              we've written where a multi-venue group runs out of road.
            </p>
          </div>
          <CompetitorProfiles />
        </div>
      </section>

      {/* Full grid */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-3xl font-bold tracking-tight mb-3">The full capability grid</h2>
            <p className="text-muted-foreground leading-relaxed">
              Grouped into five areas: AI and ordering experience, marketing and loyalty, payments, operations
              and venue fit, and platform and POS. A tick means the capability is available as a core feature.
              &ldquo;Limited&rdquo; means partial, higher-tier only, or delivered through a third party — and we've noted
              why on each cell. A dash means it is not a marketed capability.
            </p>
          </div>
          <ComparisonGrid />
        </div>
      </section>

      {/* Evaluation checklist */}
      <section className="py-16 lg:py-24 bg-muted/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              Eight questions to ask every vendor
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Take these into every demo — ours included. If a vendor can't demonstrate it live on a real venue,
              treat it as a roadmap item.
            </p>
            <ol className="space-y-4">
              {evaluationQuestions.map((q, i) => (
                <li key={q} className="flex items-start gap-4">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-foreground/85 leading-relaxed pt-0.5">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Migration */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Switching from me&u, Mr Yum or Chewzie</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Migration is a weekend, not a quarter. We import your existing menu from a URL or PDF, enhance the
              imagery, map modifiers, and mirror your zones and price levels before a single sticker changes.
              Mixed estates are fine — connectors for H&L Exceed, Doshii, Lightspeed and Square mean venues can
              move in waves rather than all at once.
            </p>
            <ul className="space-y-3">
              {[
                "Menu, modifiers and pricing imported and reviewed with you — typically same-day",
                "Zones, payment timing and service modes configured per area before go-live",
                "Permanent QR stickers printed once; URLs never change again",
                "Loyalty members migrated, with Pub+ / Eagle Eye AIR linking where applicable",
                "Pay-per-order pricing means no overlapping licence during the changeover",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-foreground/85">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <CtaBand
        headline="See the side-by-side demo."
        subheadline="Twenty minutes. The same order, placed on OrderNOW and on whatever you're running today."
      />
    </MarketingLayout>
  );
}
