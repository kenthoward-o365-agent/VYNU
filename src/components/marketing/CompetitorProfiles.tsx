import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Profile {
  name: string;
  positioning: string;
  strengths: string[];
  gaps: string[];
  winLine: string;
  footprint: string;
}

const profiles: Profile[] = [
  {
    name: "me&u",
    footprint: "AU-founded, global. Large pub, bar and hotel footprint.",
    positioning:
      "The incumbent in Australian at-table QR ordering. Strong brand recognition with venue groups and a mature tile-based ordering experience.",
    strengths: [
      "Wide AU venue adoption and familiar diner UX",
      "Solid at-table and bar-tab ordering",
      "Established POS connections via middleware",
    ],
    gaps: [
      "Menu browsing, not intent-based ordering — no agentic AI",
      "Payments brokered through third-party acquirers",
      "Loyalty and CRM are venue-scoped, not group-wide",
      "No AI revenue attribution to justify the spend",
    ],
    winLine:
      "Groups switch when they realise a digital menu is still a menu. OrderNOW replaces it with an agent that upsells on every order and reports what it earned.",
  },
  {
    name: "Mr Yum (Lightspeed)",
    footprint: "AU-founded, acquired by Lightspeed. Strong in hospitality-forward venues.",
    positioning:
      "The design-led option, known for photo and video menus. Now folded into the global Lightspeed commerce suite.",
    strengths: [
      "Best-in-class dish media and menu presentation",
      "Good dietary filtering and discovery",
      "Access to the wider Lightspeed product suite",
    ],
    gaps: [
      "Roadmap now set by a global parent, not the AU market",
      "No conversational ordering or AI campaign authoring",
      "Loyalty runs per venue; group sharing is not native",
      "No native H&L POS path",
    ],
    winLine:
      "Beautiful menus don't pace a kitchen or run a group loyalty program. OrderNOW keeps the visual discovery and adds the operations and CRM behind it.",
  },
  {
    name: "Chewzie",
    footprint: "AU. Popular with independents and value-focused venues.",
    positioning:
      "The lean, low-cost option. Fast to deploy, simple flat pricing, respected for kitchen pacing via its Smart Docket Queue.",
    strengths: [
      "Low, predictable venue pricing",
      "Quick setup and simple staff experience",
      "Genuinely good kitchen pacing controls",
    ],
    gaps: [
      "No CRM, segmentation or campaign engine",
      "No loyalty program worth the name, let alone group loyalty",
      "No AI in the ordering or marketing loop",
      "Thin group-level reporting and RBAC for multi-venue operators",
    ],
    winLine:
      "Chewzie is a fine ordering tool for one venue. It is not a growth platform for a group — OrderNOW matches the pacing and adds the CRM, loyalty and AI revenue on top.",
  },
  {
    name: "Square / Toast Order & Pay",
    footprint: "Global. Bundled with the vendor's own POS.",
    positioning:
      "Order & Pay as an add-on to a global POS ecosystem. Compelling only if you are already committed to that till.",
    strengths: [
      "Payments and POS in one commercial relationship",
      "Mature hardware and developer APIs",
      "Broad reporting and app marketplace",
    ],
    gaps: [
      "Requires their POS — no standalone path for an H&L estate",
      "Ordering UX is generic and not tuned for AU pubs and clubs",
      "AU surcharging, venue zones and pacing are weak or POS-side only",
      "Offshore support tiers and non-AU data residency",
    ],
    winLine:
      "Replacing a whole POS estate to get QR ordering is not a project. OrderNOW runs standalone today and plugs into H&L POS when you're ready.",
  },
];

export function CompetitorProfiles() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {profiles.map((p) => (
        <Card key={p.name} className="h-full border border-border/60">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
                <Badge variant="outline" className="text-[11px] font-normal">
                  {p.footprint}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.positioning}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Where they're strong
              </p>
              <ul className="space-y-1.5">
                {p.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-foreground/80">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Where groups hit the ceiling
              </p>
              <ul className="space-y-1.5">
                {p.gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-sm text-foreground/80">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1.5">
                How OrderNOW wins
              </p>
              <p className="text-sm text-foreground/85 leading-relaxed">{p.winLine}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
