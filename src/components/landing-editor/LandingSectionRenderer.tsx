import { useEffect, useState } from "react";
import type { LandingSection, LandingTheme } from "./types";
import { createDefaultTheme } from "./types";
import type { ReactNode } from "react";
// HLRDRNW-68 · IVA-04 — these URLs come from venue-edited / AI-generated /
// scraped landing content, so only render safe http(s) schemes into href/src.
import { safeHttpUrl } from "@/lib/url";
import { optimizedImageUrl } from "@/lib/image-utils";

/**
 * Venues upload both wide photography and square-ish logos into the hero
 * slot. A photo should fill the banner (cover); a logo must never be blown
 * up full-bleed and cropped — once loaded, anything squarer than 1.2:1
 * switches to contained with padding, letterboxed on the theme background.
 */
function HeroImage({ src, alt }: { src: string; alt: string }) {
  const [logoLike, setLogoLike] = useState(false);
  // Ref callback as well as onLoad: a cached image can be complete before
  // React attaches the load handler, and onLoad never fires for it.
  const measure = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalHeight > 0 && img.naturalWidth / img.naturalHeight < 1.2) {
      setLogoLike(true);
    }
  };
  return (
    <img
      ref={measure}
      src={optimizedImageUrl(src, 1200)}
      alt={alt}
      loading="eager"
      onLoad={(e) => measure(e.currentTarget)}
      className={
        logoLike
          ? "absolute inset-0 w-full h-full object-contain object-center p-6"
          : "absolute inset-0 w-full h-full object-cover object-center"
      }
    />
  );
}

interface Props {
  sections: LandingSection[];
  theme?: LandingTheme;
  tableNumber?: string;
  inlineActionsAfterIndex?: number;
  inlineActions?: ReactNode;
}

/** Load a Google Font once per family. */
function useGoogleFonts(families: string[]) {
  useEffect(() => {
    const unique = Array.from(new Set(families.filter(Boolean)));
    const added: HTMLLinkElement[] = [];
    unique.forEach((family) => {
      const id = `gf-${family.replace(/\s+/g, "-")}`;
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700;800&display=swap`;
      document.head.appendChild(link);
      added.push(link);
    });
    // Don't remove on unmount — fonts may be in use by other previews.
  }, [families.join("|")]);
}

const LandingSectionRenderer = ({ sections, theme: themeProp, tableNumber = "7", inlineActionsAfterIndex, inlineActions }: Props) => {
  const theme = { ...createDefaultTheme(), ...(themeProp || {}) };
  useGoogleFonts([theme.fontHeading, theme.fontBody]);

  return (
    <div
      className="min-h-screen font-sans"
      style={{
        background: theme.background,
        color: theme.textPrimary,
        fontFamily: `'${theme.fontBody}', system-ui, sans-serif`,
      }}
    >
      <div className="max-w-3xl mx-auto">
        {sections.map((section, index) => (
          <div key={section.id}>
            <RenderSection section={section} theme={theme} tableNumber={tableNumber} />
            {inlineActions && index === inlineActionsAfterIndex && inlineActions}
          </div>
        ))}
      </div>
    </div>
  );
};

function RenderSection({ section, theme, tableNumber }: { section: LandingSection; theme: LandingTheme; tableNumber: string }) {
  const headingFont = `'${theme.fontHeading}', system-ui, sans-serif`;

  switch (section.type) {
    case "hero": {
      const overlayOpacity = section.overlayOpacity ?? 0.5;
      const safeHeroImageUrl = safeHttpUrl(section.heroImageUrl);
      if (safeHeroImageUrl) {
        return (
          <div className="relative w-full overflow-hidden aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] max-h-[60vh]">
            <HeroImage src={safeHeroImageUrl} alt={section.title} />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to bottom, rgba(0,0,0,${overlayOpacity * 0.8}) 0%, rgba(0,0,0,${overlayOpacity * 0.5}) 50%, rgba(0,0,0,${overlayOpacity}) 100%)` }}
            />
            <div className="relative z-10 flex flex-col items-center justify-center text-center h-full px-6 py-8" style={{ color: theme.textPrimary }}>
              <h1 className="text-2xl md:text-4xl font-extrabold mb-1 md:mb-2 drop-shadow" style={{ fontFamily: headingFont }}>
                {section.title}
              </h1>
              <p className="text-sm md:text-lg drop-shadow" style={{ color: theme.textPrimary, opacity: 0.9 }}>{section.subtitle}</p>
            </div>
          </div>
        );
      }
      return (
        <div
          className="flex flex-col items-center justify-center text-center min-h-[40vh] px-6 py-12 md:py-20"
          style={{ background: section.bgColor || "transparent", color: theme.textPrimary }}
        >
          <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-3xl md:text-5xl mb-4 md:mb-6 mx-auto" style={{ background: theme.surface }}>
            {section.logoEmoji}
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold mb-1 md:mb-2" style={{ fontFamily: headingFont }}>{section.title}</h1>
          <p className="text-sm md:text-lg" style={{ color: theme.textMuted }}>{section.subtitle}</p>
        </div>
      );
    }

    case "table-display":
      return (
        <div className="flex justify-center px-6 py-6">
          <div
            className="rounded-2xl px-8 py-6 text-center min-w-[140px] md:min-w-[200px]"
            style={{
              background: section.bgColor ?? theme.surface,
              border: `1px solid ${section.borderColor ?? theme.border}`,
            }}
          >
            <p className="text-[0.65rem] md:text-xs uppercase tracking-widest mb-1" style={{ color: section.labelColor ?? theme.textMuted }}>{section.label ?? "Your Table"}</p>
            <p className="text-4xl md:text-6xl font-bold" style={{ color: section.numberColor ?? theme.accent, fontFamily: headingFont }}>{tableNumber}</p>
          </div>
        </div>
      );

    case "featured-items":
      return (
        <div className="px-6 py-8 text-center" style={{ background: section.bgColor ?? "transparent" }}>
          <h2 className="text-lg md:text-2xl font-bold mb-4 md:mb-6" style={{ color: section.titleColor ?? theme.textPrimary, fontFamily: headingFont }}>{section.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-lg md:max-w-none mx-auto">
            {section.items.map((item, i) => (
              <div
                key={i}
                className="rounded-xl p-3 md:p-4"
                style={{
                  background: section.cardBgColor ?? theme.surface,
                  border: `1px solid ${section.cardBorderColor ?? theme.border}`,
                }}
              >
                <p className="text-2xl md:text-3xl mb-2">{item.emoji}</p>
                <p className="font-semibold text-xs md:text-sm mb-1" style={{ color: theme.textPrimary }}>{item.name}</p>
                <p className="font-bold text-sm md:text-base" style={{ color: section.priceColor ?? theme.accent }}>{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "loyalty-cta": {
      const icon = section.icon !== undefined ? section.icon : "🎁";
      const iconPrefix = icon ? `${icon} ` : "";
      const safeCtaUrl = safeHttpUrl(section.ctaUrl);
      const showButton = !!(safeCtaUrl && section.ctaLabel);
      const Button = showButton ? (
        <a
          href={safeCtaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: section.buttonBgColor ?? theme.accent,
            color: section.buttonTextColor ?? "#ffffff",
          }}
        >
          {section.ctaLabel}
        </a>
      ) : null;

      const safeOfferImageUrl = safeHttpUrl(section.imageUrl);
      if (section.variant === "image" && safeOfferImageUrl) {
        return (
          <div className="flex justify-center px-6 py-6">
            <div
              className="rounded-2xl w-full max-w-xs md:max-w-md text-center relative overflow-hidden min-h-[160px] md:min-h-[200px] flex items-center justify-center"
              style={{ backgroundImage: `url("${encodeURI(safeOfferImageUrl)}")`, backgroundSize: "cover", backgroundPosition: "center" }}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 p-5 md:p-8">
                <p className="font-semibold text-base md:text-xl mb-2" style={{ color: section.headingColor ?? "#fff", fontFamily: headingFont }}>{iconPrefix}{section.heading}</p>
                <p className="text-sm md:text-base" style={{ color: section.descriptionColor ?? "rgba(255,255,255,0.85)" }}>{section.description}</p>
                {Button}
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="flex justify-center px-6 py-6">
          <div
            className="rounded-2xl p-5 md:p-8 w-full max-w-xs md:max-w-md text-center"
            style={{
              background: section.bgColor ?? `${theme.accent}26`,
              border: `1px solid ${section.borderColor ?? `${theme.accent}55`}`,
            }}
          >
            <p className="font-semibold text-base md:text-xl mb-2" style={{ color: section.headingColor ?? theme.textPrimary, fontFamily: headingFont }}>{iconPrefix}{section.heading}</p>
            <p className="text-sm md:text-base" style={{ color: section.descriptionColor ?? theme.textMuted }}>{section.description}</p>
            {Button}
          </div>
        </div>
      );
    }

    case "hours-location": {
      const content = (
        <>
          <h3 className="text-base md:text-xl font-semibold mb-3" style={{ color: section.headingColor ?? theme.textPrimary, fontFamily: headingFont }}>📍 Find Us</h3>
          <p className="text-sm md:text-base mb-1" style={{ color: section.textColor ?? theme.textMuted }}>{section.address}</p>
          <p className="text-sm md:text-base" style={{ color: section.textColor ?? theme.textMuted }}>{section.hours}</p>
        </>
      );
      const safeMapUrl = safeHttpUrl(section.mapUrl);
      return (
        <div className="px-6 py-8 text-center" style={{ background: section.bgColor ?? "transparent" }}>
          {safeMapUrl ? (
            <a href={safeMapUrl} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80 transition-opacity">
              {content}
            </a>
          ) : content}
        </div>
      );
    }

    case "social-links": {
      const iconColor = section.iconColor ?? theme.textMuted;
      const igUrl = safeHttpUrl(section.instagram);
      const fbUrl = safeHttpUrl(section.facebook);
      const googleUrl = safeHttpUrl(section.google);
      return (
        <div className="flex items-center justify-center gap-6 md:gap-8 px-6 py-6">
          {igUrl && (
            <a href={igUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={{ color: iconColor }}>
              <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>
          )}
          {fbUrl && (
            <a href={fbUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={{ color: iconColor }}>
              <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
          )}
          {googleUrl && (
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={{ color: iconColor }}>
              <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </a>
          )}
          {!igUrl && !fbUrl && !googleUrl && (
            <p className="text-sm" style={{ color: theme.textMuted }}>Add your social links</p>
          )}
        </div>
      );
    }

    case "text":
      return (
        <div className="px-6 py-4" style={{ textAlign: section.align ?? "center" }}>
          <p
            className="text-sm md:text-base"
            style={{
              color: section.color ?? theme.textMuted,
              fontWeight: section.weight === "bold" ? 700 : section.weight === "medium" ? 500 : 400,
            }}
          >
            {section.content}
          </p>
        </div>
      );

    case "divider":
      return (
        <div className="px-6 py-2">
          <hr
            className="mx-auto max-w-[200px] md:max-w-[300px]"
            style={{
              borderColor: section.color ?? theme.border,
              borderTopWidth: `${section.thickness ?? 1}px`,
            }}
          />
        </div>
      );

    case "spacer":
      return <div style={{ height: section.height }} />;

    default:
      return null;
  }
}

export default LandingSectionRenderer;
