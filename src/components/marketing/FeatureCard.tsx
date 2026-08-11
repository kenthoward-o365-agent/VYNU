import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
}

export function FeatureCard({ icon: Icon, title, description, bullets }: FeatureCardProps) {
  return (
    <Card className="h-full border border-border/60 bg-card hover:shadow-md transition-shadow">
      <CardContent className="p-6 space-y-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        <ul className="space-y-2">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <span className="text-foreground/80">{bullet}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
