import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface CtaBandProps {
  headline: string;
  subheadline?: string;
  cta?: { label: string; href: string };
}

export function CtaBand({
  headline,
  subheadline,
  cta = { label: "Book a demo", href: "mailto:sales@hl-ordernow.com?subject=Book%20a%20demo" },
}: CtaBandProps) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{headline}</h2>
          {subheadline && (
            <p className="text-primary-foreground/80 text-lg">{subheadline}</p>
          )}
          <Button
            size="lg"
            variant="secondary"
            className="bg-background text-foreground hover:bg-background/90"
            asChild
          >
            <a href={cta.href}>
              {cta.label}
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
