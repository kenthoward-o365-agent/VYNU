import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { HeroSection } from "@/components/marketing/HeroSection";
import { ComparisonGrid } from "@/components/marketing/ComparisonGrid";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Compare() {
  return (
    <MarketingLayout>
      <HeroSection
        headline="Compare H&L OrderNOW with the category."
        subheadline="Built for Australian hospitality groups. Honest, feature-by-feature benchmarking against the leading QR ordering and payment platforms."
        cta={{ label: "Book a side-by-side demo", href: "mailto:sales@hl-ordernow.com?subject=Side-by-side%20demo" }}
        secondaryCta={{ label: "See the features", href: "/features" }}
      />

      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <Button variant="ghost" asChild className="mb-6 -ml-4">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to home
              </Link>
            </Button>
            <h2 className="text-2xl font-bold tracking-tight mb-3">Feature grid</h2>
            <p className="text-muted-foreground">
              Tick means the capability is available as a core feature. Limited means it is available only in higher tiers, partially, or via third-party integrations. Dash means it is not a marketed capability.
            </p>
          </div>
          <ComparisonGrid />
        </div>
      </section>

      <CtaBand
        headline="See the side-by-side demo."
        subheadline="Walk through the same order flow on H&L OrderNOW and the alternatives."
      />
    </MarketingLayout>
  );
}
