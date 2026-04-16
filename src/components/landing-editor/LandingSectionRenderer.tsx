import type { LandingSection } from "./types";

interface Props {
  sections: LandingSection[];
  tableNumber?: string;
}

const LandingSectionRenderer = ({ sections, tableNumber = "7" }: Props) => {
  return (
    <div className="min-h-screen text-white font-sans" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
      <div className="max-w-3xl mx-auto">
        {sections.map((section) => (
          <RenderSection key={section.id} section={section} tableNumber={tableNumber} />
        ))}
      </div>
    </div>
  );
};

function RenderSection({ section, tableNumber }: { section: LandingSection; tableNumber: string }) {
  switch (section.type) {
    case "hero":
      return (
        <div
          className="flex flex-col items-center justify-center text-center min-h-[40vh] px-6 py-12 md:py-20 relative overflow-hidden"
          style={
            section.heroImageUrl
              ? { backgroundImage: `url(${section.heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: section.bgColor || "transparent" }
          }
        >
          {section.heroImageUrl && (
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
          )}
          <div className="relative z-10">
            {!section.heroImageUrl && (
              <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-3xl md:text-5xl mb-4 md:mb-6 mx-auto" style={{ background: "rgba(124,58,237,0.2)" }}>
                {section.logoEmoji}
              </div>
            )}
            <h1 className="text-2xl md:text-4xl font-extrabold mb-1 md:mb-2">{section.title}</h1>
            <p className="text-sm md:text-lg text-white/70">{section.subtitle}</p>
          </div>
        </div>
      );

    case "table-display":
      return (
        <div className="flex justify-center px-6 py-6">
          <div className="rounded-2xl px-8 py-6 text-center min-w-[140px] md:min-w-[200px]" style={{ background: section.bgColor ?? "rgba(255,255,255,0.1)", border: `1px solid ${section.borderColor ?? "rgba(255,255,255,0.15)"}` }}>
            <p className="text-[0.65rem] md:text-xs uppercase tracking-widest mb-1" style={{ color: section.labelColor ?? "rgba(255,255,255,0.5)" }}>{section.label ?? "Your Table"}</p>
            <p className="text-4xl md:text-6xl font-bold" style={{ color: section.numberColor ?? "#7c3aed" }}>{tableNumber}</p>
          </div>
        </div>
      );

    case "featured-items":
      return (
        <div className="px-6 py-8 text-center">
          <h2 className="text-lg md:text-2xl font-bold mb-4 md:mb-6">{section.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-lg md:max-w-none mx-auto">
            {section.items.map((item, i) => (
              <div key={i} className="rounded-xl p-3 md:p-4 border border-white/10" style={{ background: "rgba(255,255,255,0.08)" }}>
                <p className="text-2xl md:text-3xl mb-2">{item.emoji}</p>
                <p className="font-semibold text-xs md:text-sm mb-1">{item.name}</p>
                <p className="text-[#7c3aed] font-bold text-sm md:text-base">{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "loyalty-cta":
      if (section.variant === "image" && section.imageUrl) {
        return (
          <div className="flex justify-center px-6 py-6">
            <div
              className="rounded-2xl w-full max-w-xs md:max-w-md text-center relative overflow-hidden min-h-[160px] md:min-h-[200px] flex items-center justify-center"
              style={{ backgroundImage: `url(${section.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 p-5 md:p-8">
                <p className="font-semibold text-base md:text-xl mb-2">{(() => { const icon = section.icon !== undefined ? section.icon : "🎁"; return icon ? `${icon} ` : ""; })()}{section.heading}</p>
                <p className="text-sm md:text-base text-white/80">{section.description}</p>
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="flex justify-center px-6 py-6">
          <div className="rounded-2xl p-5 md:p-8 w-full max-w-xs md:max-w-md text-center border border-[#7c3aed]/30" style={{ background: "rgba(124,58,237,0.15)" }}>
            <p className="font-semibold text-base md:text-xl mb-2">{(() => { const icon = section.icon !== undefined ? section.icon : "🎁"; return icon ? `${icon} ` : ""; })()}{section.heading}</p>
            <p className="text-sm md:text-base text-white/70">{section.description}</p>
          </div>
        </div>
      );

    case "hours-location":
      return (
        <div className="px-6 py-8 text-center">
          <h3 className="text-base md:text-xl font-semibold mb-3">📍 Find Us</h3>
          <p className="text-sm md:text-base text-white/70 mb-1">{section.address}</p>
          <p className="text-sm md:text-base text-white/70">{section.hours}</p>
        </div>
      );

    case "social-links":
      return (
        <div className="flex items-center justify-center gap-6 md:gap-8 px-6 py-6">
          {section.instagram && (
            <a href={section.instagram} className="text-white/60 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">
              <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>
          )}
          {section.facebook && (
            <a href={section.facebook} className="text-white/60 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">
              <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
          )}
          {section.google && (
            <a href={section.google} className="text-white/60 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">
              <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </a>
          )}
          {!section.instagram && !section.facebook && !section.google && (
            <p className="text-white/40 text-sm">Add your social links</p>
          )}
        </div>
      );

    case "text":
      return (
        <div className="px-6 py-4 text-center">
          <p className="text-sm md:text-base text-white/80">{section.content}</p>
        </div>
      );

    case "divider":
      return (
        <div className="px-6 py-2">
          <hr className="border-white/15 mx-auto max-w-[200px] md:max-w-[300px]" />
        </div>
      );

    case "spacer":
      return <div style={{ height: section.height }} />;

    default:
      return null;
  }
}

export default LandingSectionRenderer;
