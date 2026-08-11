import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type CellValue = "tick" | "dash" | "limited" | "cross";

interface ComparisonRow {
  feature: string;
  values: Record<string, CellValue>;
}

const competitors = ["H&L OrderNOW", "me&u", "Mr Yum", "Chewzie", "Square / Toast"];

const rows: ComparisonRow[] = [
  { feature: "Agentic AI ordering (chat replaces the menu)", values: { "H&L OrderNOW": "tick", meu: "dash", "Mr Yum": "dash", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "AI instant campaigns (email/SMS/push/in-app)", values: { "H&L OrderNOW": "tick", meu: "limited", "Mr Yum": "limited", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "Diner CRM with birthdays, RFM & AI lookalike segments", values: { "H&L OrderNOW": "tick", meu: "limited", "Mr Yum": "limited", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "Built-in PayFac — Apple Pay, Google Pay, stored cards", values: { "H&L OrderNOW": "tick", meu: "limited", "Mr Yum": "limited", Chewzie: "dash", "Square / Toast": "tick" } },
  { feature: "Works fully standalone (no POS required)", values: { "H&L OrderNOW": "tick", meu: "tick", "Mr Yum": "tick", Chewzie: "tick", "Square / Toast": "limited" } },
  { feature: "Native H&L POS integration", values: { "H&L OrderNOW": "tick", meu: "dash", "Mr Yum": "dash", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "Multi-venue group loyalty", values: { "H&L OrderNOW": "tick", meu: "limited", "Mr Yum": "limited", Chewzie: "dash", "Square / Toast": "limited" } },
  { feature: "Order throttling & kitchen pacing", values: { "H&L OrderNOW": "tick", meu: "limited", "Mr Yum": "limited", Chewzie: "dash", "Square / Toast": "limited" } },
  { feature: "Permanent QR sticker URLs (never re-print)", values: { "H&L OrderNOW": "tick", meu: "tick", "Mr Yum": "tick", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "AI revenue attribution tile", values: { "H&L OrderNOW": "tick", meu: "dash", "Mr Yum": "dash", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "Australian support, data residency & AUD pricing", values: { "H&L OrderNOW": "tick", meu: "tick", "Mr Yum": "limited", Chewzie: "tick", "Square / Toast": "limited" } },
  { feature: "Pay-per-order pricing (no SaaS lock-in)", values: { "H&L OrderNOW": "tick", meu: "dash", "Mr Yum": "dash", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "PCI DSS SAQ-A scope", values: { "H&L OrderNOW": "tick", meu: "tick", "Mr Yum": "tick", Chewzie: "tick", "Square / Toast": "tick" } },
  { feature: "White-label landing pages per venue", values: { "H&L OrderNOW": "tick", meu: "limited", "Mr Yum": "limited", Chewzie: "dash", "Square / Toast": "dash" } },
  { feature: "AI co-pilot for managers", values: { "H&L OrderNOW": "tick", meu: "dash", "Mr Yum": "dash", Chewzie: "dash", "Square / Toast": "dash" } },
];

// Map the value keys to the display competitor names.
const keyForCompetitor: Record<string, string> = {
  "H&L OrderNOW": "H&L OrderNOW",
  "me&u": "meu",
  "Mr Yum": "Mr Yum",
  Chewzie: "Chewzie",
  "Square / Toast": "Square / Toast",
};

function Cell({ value }: { value: CellValue }) {
  if (value === "tick") {
    return (
      <div className="flex justify-center">
        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
          <Check className="h-4 w-4 text-accent" />
        </div>
      </div>
    );
  }
  if (value === "limited") {
    return (
      <div className="flex justify-center">
        <Badge variant="secondary" className="text-xs">
          Limited
        </Badge>
      </div>
    );
  }
  if (value === "cross") {
    return (
      <div className="flex justify-center">
        <X className="h-4 w-4 text-muted-foreground/50" />
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <Minus className="h-4 w-4 text-muted-foreground/50" />
    </div>
  );
}

export function ComparisonGrid() {
  return (
    <div className="overflow-x-auto">
      <Card className="min-w-[800px] border border-border/60">
        <div className="grid grid-cols-6 text-sm border-b border-border/60">
          <div className="p-4 font-semibold text-foreground sticky left-0 bg-card z-10 border-r border-border/60">
            Feature
          </div>
          {competitors.map((comp) => (
            <div
              key={comp}
              className={`p-4 font-semibold text-center ${
                comp === "H&L OrderNOW" ? "text-primary bg-primary/5" : "text-muted-foreground"
              }`}
            >
              {comp}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={row.feature}
            className="grid grid-cols-6 border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition-colors"
          >
            <div className="p-4 font-medium text-foreground sticky left-0 bg-card z-10 border-r border-border/60">
              {row.feature}
            </div>
            {competitors.map((comp) => (
              <div key={`${row.feature}-${comp}`} className="p-4 flex items-center justify-center">
                <Cell value={row.values[keyForCompetitor[comp]] || "dash"} />
              </div>
            ))}
          </div>
        ))}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Competitor data is based on publicly available feature documentation and sales materials as of August 2026. Sources available on request.
      </p>
    </div>
  );
}
