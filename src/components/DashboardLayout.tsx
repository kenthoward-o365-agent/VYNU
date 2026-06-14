import { ReactNode, useCallback, useEffect, useState } from "react";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import IdleTimeoutModal from "@/components/consumer/IdleTimeoutModal";
import CoPilotPanel, { CoPilotButton } from "@/components/copilot/CoPilotPanel";
import WalkthroughPlayer from "@/components/copilot/WalkthroughPlayer";

import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";

import { usePermissions } from "@/hooks/use-permissions";
import {
  ChevronDown, Check, Sun, Moon, HelpCircle, Menu, X, LogOut, Pin, PinOff, User
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

import POSClock from "@/components/pos/POSClock";

import {
  IconDashboard, IconSparkAI, IconMenu, IconPricing, IconTables, IconOrders,
  IconOrderCfg, IconAnalytics, IconDiners, IconDayEnd, IconBilling, IconSettings,
  IconGroup, IconVenues, IconFinance, IconHLPay, IconStaff, IconPartners, IconPOS, IconKnowledge,
} from "@/components/nav-icons";

interface NavItem {
  path: string;
  label: string;
  icon: any;
  navKey: string;
}

// Map app routes → Knowledge Base section ids so the help button is context-aware.
function routeToKbSection(pathname: string): string | null {
  const map: Array<[RegExp, string]> = [
    [/^\/dashboard/, "dashboard"],
    [/^\/admin\/dashboard/, "dashboard"],
    [/^\/sippa-analytics/, "shyndig-ai-analytics"],
    [/^\/menu/, "menu-builder"],
    [/^\/modifiers/, "menu-builder"],
    [/^\/pricing/, "pricing"],
    [/^\/rule-types/, "pricing"],
    [/^\/tables/, "tables-qr"],
    [/^\/orders\/throttling/, "operational-throttling"],
    [/^\/orders\/settings/, "orders"],
    [/^\/orders\/statuses/, "orders"],
    [/^\/orders/, "orders"],
    [/^\/analytics/, "analytics"],
    [/^\/diners/, "diners"],
    [/^\/settings\/landing-page/, "settings"],
    [/^\/settings/, "settings"],
    [/^\/reporting/, "analytics"],
    [/^\/self-onboard/, "getting-started"],
    [/^\/billing/, "settings"],
  ];
  for (const [re, id] of map) if (re.test(pathname)) return id;
  return null;
}

const venueNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: { light: navDashboard, dark: navDashboardDark }, navKey: "dashboard" },
  { path: "/sippa-analytics", label: "Spark AI", icon: { light: navAIAnalytics, dark: navAIAnalyticsDark }, navKey: "sippa_analytics" },
  { path: "/menu", label: "Menu", icon: { light: navMenuBuilder, dark: navMenuBuilderDark }, navKey: "menu" },
  { path: "/pricing", label: "Pricing", icon: { light: navPricing, dark: navPricingDark }, navKey: "pricing" },
  { path: "/tables", label: "Tables", icon: { light: navTablesQR, dark: navTablesQRDark }, navKey: "tables" },
  { path: "/orders", label: "Orders", icon: { light: navOrders, dark: navOrdersDark }, navKey: "orders" },
  { path: "/orders/settings", label: "Order Cfg", icon: Monitor, navKey: "orders" },
  { path: "/analytics", label: "Analytics", icon: { light: navAnalytics, dark: navAnalyticsDark }, navKey: "analytics" },
  { path: "/diners", label: "Diners", icon: { light: navDiners, dark: navDinersDark }, navKey: "diners" },
  { path: "/reporting", label: "DayEnd", icon: CalendarCheck, navKey: "settings" },
  { path: "/billing", label: "Billing", icon: Receipt, navKey: "settings" },
  { path: "/settings", label: "Settings", icon: { light: navSettings, dark: navSettingsDark }, navKey: "settings" },
];

const groupNavItems = [
  { path: "/group", label: "Group", icon: Building2 },
];

const adminNavItems = [
  { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/venues", label: "Venues", icon: Shield },
  { path: "/admin/financials", label: "Finance", icon: DollarSign },
  { path: "/admin/billing", label: "H&L Pay", icon: Receipt },
  { path: "/admin/staff", label: "Staff", icon: Shield },
  { path: "/admin/partners", label: "Partners", icon: Plug },
  { path: "/admin/integrations", label: "POS", icon: Cable },
  { path: "/admin/knowledge-base", label: "Knowledge", icon: BookOpen },
];

function NavTile({
  item,
  active,
  collapsed,
  theme,
  onClick,
}: {
  item: { path: string; label: string; icon: any };
  active: boolean;
  collapsed: boolean;
  theme: string;
  onClick?: () => void;
}) {
  const iconEl = typeof item.icon === "object" && "light" in item.icon ? (
    <img src={theme === "dark" ? item.icon.dark : item.icon.light} className="h-5 w-5 shrink-0" alt="" />
  ) : typeof item.icon === "string" ? (
    <img src={item.icon} className="h-5 w-5 shrink-0" alt="" />
  ) : (
    <item.icon className="h-5 w-5 shrink-0" />
  );

  const tile = (
    <Link
      to={item.path}
      data-copilot-target={item.path}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-0.5 rounded-lg transition-all",
        "border border-transparent",
        collapsed ? "h-10 w-10 mx-auto" : "h-[56px] w-full px-1",
        active
          ? "text-[hsl(var(--primary))] shadow-[inset_3px_0_0_hsl(var(--primary)),0_1px_0_hsl(var(--pos-chassis-edge))]"
          : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
      )}
      style={{
        background: active ? "hsl(var(--pos-tile-active))" : undefined,
      }}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-md transition-colors",
          collapsed ? "h-7 w-7" : "h-7 w-7",
        )}
        style={{
          background: active ? "hsl(var(--primary) / 0.15)" : "hsl(var(--pos-tile))",
        }}
      >
        {iconEl}
      </span>
      {!collapsed && (
        <span className="text-[10px] font-semibold uppercase tracking-wide leading-none text-center truncate max-w-full px-1">
          {item.label}
        </span>
      )}

    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{tile}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return tile;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const { venue, venues, isGroupAdmin, isTablessAdmin, switchVenue, venueRole } = useVenue();

  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("shyndig_sidebar_pinned");
    return stored === null ? true : stored === "1";
  });
  useEffect(() => {
    localStorage.setItem("shyndig_sidebar_pinned", pinned ? "1" : "0");
  }, [pinned]);
  const perms = usePermissions();

  const handleIdleLogout = useCallback(async () => {
    try {
      sessionStorage.setItem("idle_logout", "1");
    } catch {}
    await signOut();
  }, [signOut]);

  const idle = useIdleLogout({
    idleSeconds: 15 * 60,
    warningSeconds: 60,
    enabled: !!user,
    onTimeout: handleIdleLogout,
  });

  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!venue?.id || !perms.can("settings")) { setOnboardingStatus(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("venue_onboarding_state")
        .select("status")
        .eq("venue_id", venue.id)
        .maybeSingle();
      if (!cancelled) setOnboardingStatus((data?.status as string) ?? "in_progress");
    })();
    return () => { cancelled = true; };
  }, [venue?.id, perms, location.pathname]);
  const showSelfOnboard = !!venue && perms.can("settings") && onboardingStatus !== "completed" && onboardingStatus !== "dismissed";

  const showVenueNav = !!venue;
  const showGroupNav = showVenueNav && !isTablessAdmin && isGroupAdmin;
  const filteredVenueNav = venueNavItems.filter((item) => perms.can(item.navKey));
  const allNavItems = [
    ...(showVenueNav ? filteredVenueNav : []),
    ...(showGroupNav ? groupNavItems : []),
    ...(isTablessAdmin ? adminNavItems : []),
  ];

  const pageTitle =
    location.pathname === "/knowledge-base"
      ? "Knowledge Base"
      : location.pathname === "/orders/statuses"
      ? "Order Display System"
      : allNavItems.find((i) => i.path === location.pathname)?.label || "H&L OrderNOW";

  const siteIdShort = venue?.id ? venue.id.slice(0, 4).toUpperCase() : null;
  const hour = new Date().getHours();
  const shift =
    hour < 11 ? "Breakfast" : hour < 15 ? "Lunch" : hour < 17 ? "Afternoon" : hour < 22 ? "Dinner" : "Late";

  const roleLabel = isTablessAdmin ? "Platform Admin" : (venueRole || "Operator");

  const isActivePath = (item: NavItem) =>
    location.pathname === item.path ||
    (item.path === "/settings" && location.pathname.startsWith("/settings")) ||
    (item.path === "/diners" && location.pathname.startsWith("/diners")) ||
    (item.path === "/pricing" && (location.pathname === "/menu-times" || location.pathname === "/rule-types")) ||
    (item.path === "/menu" && location.pathname === "/modifiers") ||
    (item.path === "/reporting" && location.pathname.startsWith("/reporting")) ||
    (item.path === "/orders/settings" && (location.pathname === "/orders/statuses" || location.pathname === "/orders/throttling" || location.pathname === "/orders/settings")) ||
    (item.path === "/orders" && location.pathname === "/orders");

  const railWidth = pinned ? "w-16" : "w-24";

  return (
    <>
      {/* App container — bezel removed */}
      <div className="h-screen w-full flex items-stretch justify-center overflow-hidden bg-background">
        <div className="w-full h-full flex flex-col overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden" style={{ background: "hsl(var(--background))" }}>



            {/* Top status bar */}
            <div
              className="flex items-center gap-3 px-3 lg:px-5 h-12 border-b shrink-0"
              style={{
                background: "hsl(var(--pos-status-bar))",
                color: "hsl(var(--pos-status-fg))",
                borderColor: "hsl(var(--pos-chassis-edge))",
              }}
            >
              <button className="lg:hidden text-white" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <img
                src="/brand/shyndig-icon.png"
                alt="H&L OrderNOW"
                className="h-8 w-auto object-contain shrink-0"
              />
              <div className="hidden sm:flex items-center gap-2 text-[12px]">
                {showVenueNav ? (
                  venues.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10 transition-colors">
                          <span className="font-semibold">{venue?.name}</span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {venues.map((v) => (
                          <DropdownMenuItem key={v.id} onClick={() => switchVenue(v.id)} className="flex items-center justify-between">
                            <span className="truncate">{v.name}</span>
                            {v.id === venue?.id && <Check className="h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="font-semibold px-2">{venue?.name}</span>
                  )
                ) : (
                  <span className="font-semibold px-2">H&L OrderNOW</span>
                )}
                {siteIdShort && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="opacity-70 tabular-nums">#{siteIdShort}</span>
                  </>
                )}
                {showVenueNav && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="opacity-80">{shift} Shift</span>
                  </>
                )}
              </div>

              <h1 className="ml-auto lg:ml-6 text-sm font-semibold tracking-wide hidden md:block">
                {pageTitle}
              </h1>

              <div className="ml-auto flex items-center gap-1.5">
                {showSelfOnboard && (
                  <Link
                    to="/self-onboard"
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium bg-primary/20 text-white hover:bg-primary/30 transition-colors"
                    title="Self Onboard"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Self Onboard</span>
                  </Link>
                )}
                <Link
                  to={`/knowledge-base${routeToKbSection(location.pathname) ? `?section=${routeToKbSection(location.pathname)}` : ""}`}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title="Knowledge Base — help for this page"
                >
                  <HelpCircle className="h-4 w-4" />
                </Link>
                {showVenueNav && perms.can("copilot") && (
                  <div className="text-white">
                    <CoPilotButton onClick={() => setCopilotOpen(true)} />
                  </div>
                )}
                <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-white/10 text-[12px]">
                  <div className="flex flex-col items-end leading-tight">
                    <span className="font-semibold truncate max-w-[160px]">{user?.email?.split("@")[0]}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-60">{roleLabel}</span>
                  </div>
                  <POSClock className="flex items-center text-[12px]" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center justify-center h-8 w-8 rounded-md text-white/80 hover:bg-white/10 transition-colors">
                      <User className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-3 py-2 text-sm font-medium text-foreground border-b border-border">
                      {user?.email}
                    </div>
                    <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                      {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                      {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Body: tile rail + screen */}
            <div className="flex flex-1 overflow-hidden">
              {sidebarOpen && (
                <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
              )}

              <aside
                className={cn(
                  "fixed inset-y-0 left-0 z-50 flex flex-col transition-[transform,width] duration-200 lg:static lg:translate-x-0",
                  "border-r",
                  pinned ? "w-16" : "w-24",
                  sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
                )}
                style={{
                  background: "hsl(var(--sidebar-background))",
                  borderColor: "hsl(var(--pos-chassis-edge))",
                }}
              >
                <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: "hsl(var(--pos-chassis-edge))" }}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setPinned(!pinned)}
                        className="hidden lg:inline-flex p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors mx-auto"
                        aria-label={pinned ? "Expand sidebar" : "Collapse sidebar"}
                      >
                        {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{pinned ? "Expand" : "Collapse"}</TooltipContent>
                  </Tooltip>
                  <button className="lg:hidden text-sidebar-foreground ml-auto" onClick={() => setSidebarOpen(false)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <nav className={cn("flex-1 overflow-y-auto py-2 space-y-0.5", pinned ? "px-1.5" : "px-2")}>
                  {showVenueNav && filteredVenueNav.map((item) => (
                    <NavTile
                      key={item.path}
                      item={item}
                      active={isActivePath(item)}
                      collapsed={pinned}
                      theme={theme}
                      onClick={() => setSidebarOpen(false)}
                    />
                  ))}

                  {showGroupNav && (
                    <>
                      {!pinned && (
                        <div className="pt-3 pb-1 px-1">
                          <div className="h-px bg-sidebar-border mb-2" />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-sidebar-muted">Group</span>
                        </div>
                      )}
                      {groupNavItems.map((item) => (
                        <NavTile
                          key={item.path}
                          item={item}
                          active={location.pathname === item.path}
                          collapsed={pinned}
                          theme={theme}
                          onClick={() => setSidebarOpen(false)}
                        />
                      ))}
                    </>
                  )}

                  {isTablessAdmin && (
                    <>
                      {!pinned && (
                        <div className="pt-3 pb-1 px-1">
                          <div className="h-px bg-sidebar-border mb-2" />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-sidebar-muted">Admin</span>
                        </div>
                      )}
                      {adminNavItems.map((item) => (
                        <NavTile
                          key={item.path}
                          item={item}
                          active={location.pathname.startsWith(item.path)}
                          collapsed={pinned}
                          theme={theme}
                          onClick={() => setSidebarOpen(false)}
                        />
                      ))}
                    </>
                  )}
                </nav>
              </aside>

              <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ background: "hsl(var(--background))" }}>
                {children}
              </main>
            </div>
          </div>
        </div>
      </div>

      <IdleTimeoutModal
        open={idle.warningOpen}
        secondsLeft={idle.secondsLeft}
        totalSeconds={idle.warningSeconds}
        onStay={idle.reset}
        onEnd={idle.endNow}
      />
      {showVenueNav && perms.can("copilot") && (
        <>
          <CoPilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />
          <WalkthroughPlayer />
        </>
      )}
    </>
  );
}
