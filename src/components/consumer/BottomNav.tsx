import { cn } from "@/lib/utils";

interface BottomNavProps {
  active: "feed" | "chat" | "cart" | "profile";
  onNavigate: (tab: "feed" | "chat" | "cart" | "profile") => void;
  cartCount?: number;
  agentName?: string;
  /** Optional custom agent icon uploaded by the venue. When set, replaces the default Spark icon. */
  agentIconUrl?: string | null;
  /**
   * Whether the venue's package includes AI chat ordering (`ai.chat_ordering`).
   * When false the tab is not rendered at all; the row is `justify-around`, so
   * the remaining three reflow evenly.
   */
  showChat?: boolean;
}

type IconProps = { className?: string };

// Unified icon set — single weight (1.6), rounded caps/joins, currentColor stroke.
// Designed to feel like a coherent family across all four tabs.

const MenuIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

const SparkIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4 L13.7 10.3 L20 12 L13.7 13.7 L12 20 L10.3 13.7 L4 12 L10.3 10.3 Z" />
    <path d="M19 4.5 L19.6 6.4 L21.5 7 L19.6 7.6 L19 9.5 L18.4 7.6 L16.5 7 L18.4 6.4 Z" />
  </svg>
);

const CartIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2.2L7 15.5a2 2 0 0 0 2 1.7h8.2a2 2 0 0 0 2-1.6L21 8H6.2" />
    <circle cx="9.5" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
  </svg>
);

const ProfileIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.4-3.8 4.4-5.8 7.5-5.8s6.1 2 7.5 5.8" />
  </svg>
);

const BottomNav = ({ active, onNavigate, cartCount = 0, agentName, agentIconUrl, showChat = true }: BottomNavProps) => {
  const chatLabel = agentName || "Chat";

  const tabs = [
    { id: "feed" as const, label: "Menu", Icon: MenuIcon },
    ...(showChat ? [{ id: "chat" as const, label: chatLabel, Icon: SparkIcon }] : []),
    { id: "cart" as const, label: "Cart", Icon: CartIcon },
    { id: "profile" as const, label: "Profile", Icon: ProfileIcon },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-card/95 backdrop-blur-lg border-t border-border z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = active === id;
          // Only the chat tab supports a venue-uploaded custom raster icon.
          const showCustomAgentIcon = id === "chat" && !!agentIconUrl;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 basis-0 py-1 transition-colors relative",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                {showCustomAgentIcon ? (
                  <img
                    src={agentIconUrl as string}
                    alt={label}
                    className={cn(
                      "h-5 w-5 rounded-full object-cover ring-1 transition-colors",
                      isActive ? "ring-primary" : "ring-transparent"
                    )}
                  />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                {id === "cart" && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
