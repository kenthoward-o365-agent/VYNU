/**
 * VYNU — bespoke nav icon family.
 *
 * One cohesive set, drawn on a 24px grid with a uniform 1.5px stroke,
 * 2px rounded corners, round line caps. Inherits `currentColor` so the
 * sidebar's active / inactive / hover states drive colour.
 *
 * Style: "kitchen-precise monoline" — calm, hospitality-grade, no fills
 * unless used as a deliberate accent dot. Designed solely for OrderNOW.
 */
import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  xmlns: "http://www.w3.org/2000/svg",
};

const Svg = (props: IconProps & { children: React.ReactNode }) => {
  const { children, className, ...rest } = props;
  return (
    <svg {...base} {...rest} className={className}>
      {children}
    </svg>
  );
};

/* ---------- Venue nav ---------- */

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </Svg>
);

export const IconSparkAI = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z" />
    <circle cx="18.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="5.5" cy="18.5" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

// Cloche / serving dome — restaurant-specific menu metaphor.
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18h18" />
    <path d="M4 18a8 8 0 0 1 16 0" />
    <path d="M12 6.5V5" />
    <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

// Card with embossed chip + currency mark.
export const IconPricing = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <rect x="6" y="10" width="4" height="3" rx="0.6" />
    <path d="M16 14.5h-2.2M14.9 13v3M13.8 16h2.2" />
  </Svg>
);

// Floorplan: a table with four seats around it (also reads as QR target).
export const IconTables = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <circle cx="12" cy="3.5" r="1.4" />
    <circle cx="12" cy="20.5" r="1.4" />
    <circle cx="3.5" cy="12" r="1.4" />
    <circle cx="20.5" cy="12" r="1.4" />
  </Svg>
);

// Receipt / docket.
export const IconOrders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 20V3z" />
    <path d="M9 8h6M9 11.5h6M9 15h4" />
  </Svg>
);

// Order configuration — kitchen display + cog.
export const IconOrderCfg = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
    <circle cx="12" cy="10" r="1.5" />
    <path d="M12 7v1.2M12 11.8V13M14.6 10h-1.2M9.4 10h1.2" />
  </Svg>
);

// Trend line chart.
export const IconAnalytics = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 20V4" />
    <path d="M3 20h18" />
    <path d="M6 16l4-4 3 3 6-7" />
    <circle cx="19" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

// Diner / guest — single person.
export const IconDiners = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
  </Svg>
);

// Day-end — moon + tick.
export const IconDayEnd = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    <path d="M14.5 12.5l1.4 1.4 2.4-2.6" />
  </Svg>
);

// Billing — invoice stack.
export const IconBilling = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h10l3 3v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21V3z" />
    <path d="M9 9h7M9 12.5h7M9 16h4" />
  </Svg>
);

// Settings — sliders (calmer than a gear).
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2" />
    <circle cx="16" cy="6" r="2" />
    <path d="M4 12h2M10 12h10" />
    <circle cx="8" cy="12" r="2" />
    <path d="M4 18h12M20 18h0" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);

/* ---------- Group / admin nav ---------- */

export const IconGroup = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21V8l5-3 5 3v13" />
    <path d="M13 21V12l4-2 4 2v9" />
    <path d="M3 21h18" />
    <path d="M7 12h1M7 16h1M16 15h1M16 18h1" />
  </Svg>
);

// Venues — storefront.
export const IconVenues = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9l1.5-4h15L21 9" />
    <path d="M4 9v11h16V9" />
    <path d="M9 20v-6h6v6" />
    <path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3 1.3 3 3 3 3-1.3 3-3 1.3 3 3 3 3-1.3 3-3" />
  </Svg>
);

// Finance — coin stack.
export const IconFinance = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6" rx="7" ry="2.5" />
    <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
    <path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    <path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
  </Svg>
);

// H&L Pay — terminal with tap glyph.
export const IconHLPay = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <rect x="7.5" y="6" width="9" height="5" rx="1" />
    <path d="M9 15h2M13 15h2M9 18h2M13 18h2" />
  </Svg>
);

// Staff — shield + person.
export const IconStaff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6l8-3z" />
    <circle cx="12" cy="11" r="2" />
    <path d="M8.5 16.5c.6-1.7 2-2.5 3.5-2.5s2.9.8 3.5 2.5" />
  </Svg>
);

// Partners — interlocking arcs.
export const IconPartners = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 7a5 5 0 1 0 0 10" />
    <path d="M14 7a5 5 0 1 1 0 10" />
    <path d="M9.5 12h5" />
  </Svg>
);

// POS integrations — node link.
export const IconPOS = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="6" r="2" />
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="12" r="2" />
    <path d="M7 6h4a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3" />
    <path d="M7 18h4a3 3 0 0 0 3-3v0a3 3 0 0 1 3-3" />
  </Svg>
);

// Knowledge — open book.
export const IconKnowledge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5.5C3 4.7 3.7 4 4.5 4H10a2 2 0 0 1 2 2v14a1.5 1.5 0 0 0-1.5-1.5H3V5.5z" />
    <path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H14a2 2 0 0 0-2 2v14a1.5 1.5 0 0 1 1.5-1.5H21V5.5z" />
  </Svg>
);
