export type SectionType =
  | "hero"
  | "table-display"
  | "featured-items"
  | "loyalty-cta"
  | "hours-location"
  | "social-links"
  | "text"
  | "divider"
  | "spacer";

export interface LandingTheme {
  /** Solid hex OR CSS gradient string (anything valid in `background`). */
  background: string;
  surface: string;        // panel/card fill
  border: string;         // subtle border
  textPrimary: string;
  textMuted: string;
  accent: string;         // table number, CTA buttons, links
  fontHeading: string;    // Google Font family name
  fontBody: string;       // Google Font family name
}

export interface HeroSection {
  id: string;
  type: "hero";
  title: string;
  subtitle: string;
  bgColor: string;
  logoEmoji: string;
  heroImageUrl?: string;
  overlayOpacity?: number; // 0–0.9, default 0.5
}

export interface TableDisplaySection {
  id: string;
  type: "table-display";
  label?: string;
  numberColor?: string;
  bgColor?: string;
  borderColor?: string;
  labelColor?: string;
}

export interface FeaturedItem {
  emoji: string;
  name: string;
  price: string;
}

export interface FeaturedItemsSection {
  id: string;
  type: "featured-items";
  title: string;
  items: FeaturedItem[];
  bgColor?: string;
  cardBgColor?: string;
  cardBorderColor?: string;
  titleColor?: string;
  priceColor?: string;
}

export interface LoyaltyCTASection {
  id: string;
  type: "loyalty-cta";
  heading: string;
  description: string;
  variant?: "text" | "image";
  imageUrl?: string;
  icon?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  bgColor?: string;
  borderColor?: string;
  headingColor?: string;
  descriptionColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
}

export interface HoursLocationSection {
  id: string;
  type: "hours-location";
  address: string;
  hours: string;
  mapUrl?: string;
  bgColor?: string;
  headingColor?: string;
  textColor?: string;
}

export interface SocialLinksSection {
  id: string;
  type: "social-links";
  instagram: string;
  facebook: string;
  google: string;
  iconColor?: string;
  iconHoverColor?: string;
}

export interface TextSection {
  id: string;
  type: "text";
  content: string;
  color?: string;
  align?: "left" | "center" | "right";
  weight?: "normal" | "medium" | "bold";
}

export interface DividerSection {
  id: string;
  type: "divider";
  color?: string;
  thickness?: number;
}

export interface SpacerSection {
  id: string;
  type: "spacer";
  height: number;
}

export type LandingSection =
  | HeroSection
  | TableDisplaySection
  | FeaturedItemsSection
  | LoyaltyCTASection
  | HoursLocationSection
  | SocialLinksSection
  | TextSection
  | DividerSection
  | SpacerSection;

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "🏠 Hero",
  "table-display": "🪑 Table Number",
  "featured-items": "⭐ Featured Items",
  "loyalty-cta": "🎁 Loyalty CTA",
  "hours-location": "📍 Hours & Location",
  "social-links": "📱 Social Links",
  text: "📝 Text",
  divider: "➖ Divider",
  spacer: "↕️ Spacer",
};

export const SECTION_DESCRIPTIONS: Record<SectionType, string> = {
  hero: "Big welcome header with your venue name",
  "table-display": "Shows the diner's assigned table number",
  "featured-items": "Highlight today's specials or popular dishes",
  "loyalty-cta": "Encourage diners to sign up for rewards",
  "hours-location": "Display your address and opening hours",
  "social-links": "Links to your social media profiles",
  text: "A simple text paragraph",
  divider: "A thin horizontal line separator",
  spacer: "Empty vertical space",
};

export function createDefaultTheme(): LandingTheme {
  return {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    surface: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.15)",
    textPrimary: "#ffffff",
    textMuted: "rgba(255,255,255,0.7)",
    accent: "#7c3aed",
    fontHeading: "Inter",
    fontBody: "Inter",
  };
}

export interface LandingPayload {
  theme: LandingTheme;
  sections: LandingSection[];
}

/** Parse stored JSON, upgrading legacy bare-array payloads with a default theme. */
export function parseLandingPayload(raw: string | null | undefined): LandingPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { theme: createDefaultTheme(), sections: parsed as LandingSection[] };
    }
    if (parsed && Array.isArray(parsed.sections)) {
      return {
        theme: { ...createDefaultTheme(), ...(parsed.theme || {}) },
        sections: parsed.sections as LandingSection[],
      };
    }
  } catch {
    // legacy HTML
  }
  return null;
}

export function createDefaultSection(type: SectionType): LandingSection {
  const id = crypto.randomUUID();
  switch (type) {
    case "hero":
      return { id, type, title: "Welcome", subtitle: "Scan, order, enjoy — no app needed", bgColor: "#1a1a2e", logoEmoji: "🍽️", heroImageUrl: "", overlayOpacity: 0.5 };
    case "table-display":
      return { id, type, label: "Your Table" };
    case "featured-items":
      return {
        id, type, title: "Today's Specials",
        items: [
          { emoji: "🥩", name: "Wagyu Steak", price: "$45" },
          { emoji: "🍷", name: "House Wine", price: "$12" },
        ],
      };
    case "loyalty-cta":
      return { id, type, heading: "Earn Rewards", description: "Sign up for our loyalty program and earn points with every order.", variant: "text" as const, imageUrl: "", icon: "🎁", ctaLabel: "", ctaUrl: "" };
    case "hours-location":
      return { id, type, address: "123 Main Street, Sydney NSW 2000", hours: "Mon-Fri 11am-10pm · Sat-Sun 9am-11pm" };
    case "social-links":
      return { id, type, instagram: "", facebook: "", google: "" };
    case "text":
      return { id, type, content: "Your text here", align: "center" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, height: 32 };
  }
}
