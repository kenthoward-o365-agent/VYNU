import type { LandingSection } from "./types";

interface Props {
  sections: LandingSection[];
  tableNumber?: string;
}

const LandingSectionRenderer = ({ sections, tableNumber = "7" }: Props) => {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {sections.map((section) => (
        <RenderSection key={section.id} section={section} tableNumber={tableNumber} />
      ))}
    </div>
  );
};

function RenderSection({ section, tableNumber }: { section: LandingSection; tableNumber: string }) {
  switch (section.type) {
    case "hero":
      return (
        <div style={{ padding: "3rem 1.5rem", textAlign: "center", background: section.bgColor || "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh" }}>
          <div style={{ width: 80, height: 80, borderRadius: "1rem", background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", margin: "0 auto 1.5rem" }}>
            {section.logoEmoji}
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem" }}>{section.title}</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.9rem", margin: 0 }}>{section.subtitle}</p>
        </div>
      );

    case "table-display":
      return (
        <div style={{ padding: "1.5rem", display: "flex", justifyContent: "center" }}>
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: "1rem", padding: "1.5rem 2rem", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 160 }}>
            <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", margin: "0 0 0.25rem" }}>Your Table</p>
            <p style={{ fontSize: "3rem", fontWeight: 700, color: "#7c3aed", margin: 0 }}>{tableNumber}</p>
          </div>
        </div>
      );

    case "featured-items":
      return (
        <div style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 1rem" }}>{section.title}</h2>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            {section.items.map((item, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "0.75rem", padding: "1rem", width: 130, border: "1px solid rgba(255,255,255,0.1)" }}>
                <p style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>{item.emoji}</p>
                <p style={{ fontWeight: 600, fontSize: "0.8rem", margin: "0 0 0.25rem" }}>{item.name}</p>
                <p style={{ color: "#7c3aed", fontWeight: 700, fontSize: "0.85rem", margin: 0 }}>{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "loyalty-cta":
      return (
        <div style={{ padding: "1.5rem", display: "flex", justifyContent: "center" }}>
          <div style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "1rem", padding: "1.5rem", maxWidth: 300, width: "100%", textAlign: "center" }}>
            <p style={{ fontWeight: 600, fontSize: "1rem", margin: "0 0 0.5rem" }}>🎁 {section.heading}</p>
            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>{section.description}</p>
          </div>
        </div>
      );

    case "hours-location":
      return (
        <div style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>📍 Find Us</h3>
          <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", margin: "0 0 0.25rem" }}>{section.address}</p>
          <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>{section.hours}</p>
        </div>
      );

    case "social-links":
      return (
        <div style={{ padding: "1.5rem", textAlign: "center", display: "flex", gap: "1.5rem", justifyContent: "center", alignItems: "center" }}>
          {section.instagram && (
            <a href={section.instagram} style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>
          )}
          {section.facebook && (
            <a href={section.facebook} style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
          )}
          {section.google && (
            <a href={section.google} style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </a>
          )}
          {!section.instagram && !section.facebook && !section.google && (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>Add your social links</p>
          )}
        </div>
      );

    case "text":
      return (
        <div style={{ padding: "1rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.8)", margin: 0 }}>{section.content}</p>
        </div>
      );

    case "divider":
      return (
        <div style={{ padding: "0.5rem 1.5rem" }}>
          <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.15)", margin: "0 auto", maxWidth: 200 }} />
        </div>
      );

    case "spacer":
      return <div style={{ height: section.height }} />;

    default:
      return null;
  }
}

export default LandingSectionRenderer;
