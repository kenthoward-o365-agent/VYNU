import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface HeroSectionProps {
  headline: string;
  subheadline: string;
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  children?: React.ReactNode;
}

export function HeroSection({
  headline,
  subheadline,
  cta = { label: "Book a demo", href: "mailto:sales@hl-ordernow.com?subject=Book%20a%20demo" },
  secondaryCta,
  children,
}: HeroSectionProps) {
  return (
    <section className="relative bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-foreground via-[hsl(203,42%,16%)] to-[hsl(203,42%,10%)]" />
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,hsl(198,70%,55%),transparent_40%)]" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative pt-32 pb-20 lg:pt-40 lg:pb-28">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            {headline}
          </h1>
          <p className="text-lg sm:text-xl text-background/80 max-w-2xl mx-auto leading-relaxed">
            {subheadline}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
              <a href={cta.href}>
                {cta.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            {secondaryCta && (
              <Button size="lg" variant="outline" className="border-background/30 text-background hover:bg-background/10" asChild>
                <a href={secondaryCta.href}>{secondaryCta.label}</a>
              </Button>
            )}
          </div>
          {children && <div className="mt-12 lg:mt-16">{children}</div>}
        </div>
      </div>
    </section>
  );
}
