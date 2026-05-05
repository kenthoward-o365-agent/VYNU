import { Utensils, MessageCircle, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  active: "feed" | "chat" | "cart" | "profile";
  onNavigate: (tab: "feed" | "chat" | "cart" | "profile") => void;
  cartCount?: number;
  agentName?: string;
  agentIconUrl?: string | null;
}

const BottomNav = ({ active, onNavigate, cartCount = 0, agentName, agentIconUrl }: BottomNavProps) => {
  const chatLabel = agentName || "Chat";

  const tabs = [
    { id: "feed" as const, icon: Utensils, label: "Menu", customIcon: null },
    { id: "chat" as const, icon: MessageCircle, label: chatLabel, customIcon: agentIconUrl },
    { id: "cart" as const, icon: ShoppingCart, label: "Cart", customIcon: null },
    { id: "profile" as const, icon: User, label: "Profile", customIcon: null },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-card/95 backdrop-blur-lg border-t border-border z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ id, icon: Icon, label, customIcon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 basis-0 py-1 transition-colors relative",
              active === id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative">
              {customIcon ? (
                <img src={customIcon} alt={label} className="h-5 w-5 rounded-full object-cover" />
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
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
