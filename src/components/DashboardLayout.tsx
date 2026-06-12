import { ReactNode, useCallback, useEffect, useState } from "react";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import IdleTimeoutModal from "@/components/consumer/IdleTimeoutModal";
import CoPilotPanel, { CoPilotButton } from "@/components/copilot/CoPilotPanel";

import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";

import { usePermissions } from "@/hooks/use-permissions";
import {
  ChevronDown, Check, Sun, Moon, Shield, Upload, ImagePlus, SlidersHorizontal, Sliders, Gift, Bot, CreditCard, Receipt, HelpCircle, DollarSign, Percent, Tag, Settings, Users, Menu, X, LogOut, Building2, LayoutDashboard, CalendarCheck, FileText, Plug, Cable, Monitor, Pin, PinOff, BookOpen, Sparkles, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

import navDashboard from "@/assets/nav-icons/dashboard.svg";
import navDashboardDark from "@/assets/nav-icons/dashboard-dark.svg";
import navAIAnalytics from "@/assets/nav-icons/Shyndig_AI_Analytics.svg";
import navAIAnalyticsDark from "@/assets/nav-icons/Shyndig_AI_Analytics-dark.svg";
import navMenuBuilder from "@/assets/nav-icons/menu-builder.svg";
import navMenuBuilderDark from "@/assets/nav-icons/menu-builder-dark.svg";
import navPricing from "@/assets/nav-icons/pricing.svg";
import navPricingDark from "@/assets/nav-icons/pricing-dark.svg";
import navTablesQR from "@/assets/nav-icons/tables-qr.svg";
import navTablesQRDark from "@/assets/nav-icons/tables-qr-dark.svg";
import navOrders from "@/assets/nav-icons/orders.svg";
import navOrdersDark from "@/assets/nav-icons/orders-dark.svg";
import navAnalytics from "@/assets/nav-icons/analytics.svg";
import navAnalyticsDark from "@/assets/nav-icons/analytics-dark.svg";
import navDiners from "@/assets/nav-icons/diners.svg";
import navDinersDark from "@/assets/nav-icons/diners-dark.svg";
import navSettings from "@/assets/nav-icons/settings.svg";
import navSettingsDark from "@/assets/nav-icons/settings-dark.svg";

interface NavItem {
  path: string;
  label: string;
  icon: any;
  hasSub?: boolean;
  navKey: string;
}

const venueNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: { light: navDashboard, dark: navDashboardDark }, navKey: "dashboard" },
  { path: "/sippa-analytics", label: "Spark AI Analytics", icon: { light: navAIAnalytics, dark: navAIAnalyticsDark }, navKey: "sippa_analytics" },
  { path: "/menu", label: "Menu Builder", icon: { light: navMenuBuilder, dark: navMenuBuilderDark }, hasSub: true, navKey: "menu" },
  { path: "/pricing", label: "Pricing", icon: { light: navPricing, dark: navPricingDark }, hasSub: true, navKey: "pricing" },
  { path: "/tables", label: "Tables & QR", icon: { light: navTablesQR, dark: navTablesQRDark }, navKey: "tables" },
  { path: "/orders", label: "Orders", icon: { light: navOrders, dark: navOrdersDark }, navKey: "orders" },
  { path: "/analytics", label: "Analytics", icon: { light: navAnalytics, dark: navAnalyticsDark }, navKey: "analytics" },
  { path: "/diners", label: "Diners", icon: { light: navDiners, dark: navDinersDark }, hasSub: true, navKey: "diners" },
  { path: "/reporting", label: "DayEnd", icon: CalendarCheck, hasSub: true, navKey: "settings" },
  { path: "/billing", label: "Billing", icon: Receipt, navKey: "settings" },
  { path: "/settings", label: "Settings", icon: { light: navSettings, dark: navSettingsDark }, navKey: "settings" },
];

const groupNavItems = [
  { path: "/group", label: "Parent Company", icon: Building2 },
];

const adminNavItems = [
  { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/venues", label: "Manage Venues", icon: Shield },
  { path: "/admin/financials", label: "Financials", icon: DollarSign },
  { path: "/admin/billing", label: "H&L Pay AR", icon: Receipt },
  { path: "/admin/staff", label: "Platform Staff", icon: Shield },
  { path: "/admin/partners", label: "API Partners", icon: Plug },
  { path: "/admin/integrations", label: "POS Integrations", icon: Cable },
  { path: "/admin/knowledge-base", label: "Knowledge Base", icon: BookOpen },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const { venue, venues, group, isGroupAdmin, isTablessAdmin, switchVenue } = useVenue();
  
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("shyndig_sidebar_pinned") === "1";
  });
  useEffect(() => {
    localStorage.setItem("shyndig_sidebar_pinned", pinned ? "1" : "0");
  }, [pinned]);
  const perms = usePermissions();

  // Single-open accordion: which top-level group is expanded.
  const groupForPath = useCallback((p: string, search: string): string | null => {
    if (p.startsWith("/diners")) return "diners";
    if (p.startsWith("/orders/")) return "orders";
    if (p.startsWith("/reporting")) return "reporting";
    if (p === "/rule-types" || p === "/menu-times") return "pricing";
    if (p === "/modifiers") return "menu";
    if (p === "/menu") {
      const sp = new URLSearchParams(search);
      if (sp.get("import") || sp.get("enhance")) return "menu";
    }
    return null;
  }, []);
  const [openGroup, setOpenGroup] = useState<string | null>(() => groupForPath(location.pathname, location.search));
  useEffect(() => {
    const g = groupForPath(location.pathname, location.search);
    if (g) setOpenGroup(g);
  }, [location.pathname, location.search, groupForPath]);

  // PCI DSS / SOC 2 inactivity logout: 15 min idle, 60s warning.
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

  // Self Onboard button visibility — show until status is completed or dismissed.
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

  return (
    <>
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col transition-[transform,width] duration-200 lg:static lg:translate-x-0",
        "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
        pinned ? "w-16" : "w-64",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className={cn("border-b border-sidebar-border relative", pinned ? "p-2" : "p-4")}>
          <div className="flex items-center justify-center mb-2"> 
            <img
              src="/brand/shyndig-icon.png"
              alt="H&L OrderNOW"
              className={cn(
                "object-contain",
                pinned ? "h-10 w-auto max-w-[56px]" : "h-28 w-auto max-w-[220px]"
              )}
            />
            {!pinned && (
              <div className="absolute right-3 top-3 flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setPinned(true)}
                      className="hidden lg:inline-flex p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      aria-label="Collapse sidebar"
                    >
                      <PinOff className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Collapse sidebar</TooltipContent>
                </Tooltip>
                <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
          {pinned && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPinned(false)}
                  className="hidden lg:flex w-full justify-center p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  aria-label="Expand sidebar"
                >
                  <Pin className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          )}

          {!pinned && showVenueNav && (venues.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-sm bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 transition-colors">
                  <span className="truncate">{venue?.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0" />
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
            <p className="text-xs text-sidebar-muted truncate px-2">{venue?.name}</p>
          ))}
        </div>

        <nav className={cn("flex-1 overflow-y-auto space-y-1", pinned ? "p-2" : "p-3")}>
          {showVenueNav && filteredVenueNav.map((item) => {
            const active = location.pathname === item.path || (item.path === "/settings" && location.pathname.startsWith("/settings")) || (item.path === "/diners" && location.pathname.startsWith("/diners")) || (item.path === "/pricing" && location.pathname === "/menu-times") || (item.path === "/reporting" && location.pathname.startsWith("/reporting")) || (item.path === "/orders" && location.pathname.startsWith("/orders"));
            const isMenuBuilder = item.path === "/menu";
            const isDiners = item.path === "/diners";
            const isPricing = item.path === "/pricing";
            const isDayEnd = item.path === "/reporting";
            const isOrders = item.path === "/orders";
            const hasSub = isMenuBuilder || isDiners || isPricing || isDayEnd || isOrders;
            const groupKey = isMenuBuilder ? "menu" : isDiners ? "diners" : isPricing ? "pricing" : isDayEnd ? "reporting" : isOrders ? "orders" : null;

            const iconEl = typeof item.icon === 'object' && 'light' in item.icon ? (
              <img src={theme === 'dark' ? item.icon.dark : item.icon.light} className="h-4 w-4 shrink-0" alt="" />
            ) : typeof item.icon === 'string' ? (
              <img src={item.icon} className="h-4 w-4 shrink-0" alt="" />
            ) : (
              <item.icon className="h-4 w-4 shrink-0" />
            );

            if (pinned) {
              const subItems: { to: string; label: string; icon: any }[] = isMenuBuilder ? [
                { to: "/menu?import=true", label: "Import", icon: Upload },
                { to: "/menu?enhance=true", label: "Enhance Images", icon: ImagePlus },
                { to: "/modifiers", label: "Modifiers", icon: SlidersHorizontal },
              ] : isOrders ? [
                { to: "/orders/statuses", label: "Order Display System", icon: Monitor },
                { to: "/orders/throttling", label: "Operational Throttling", icon: Sliders },
              ] : isPricing ? [
                { to: "/rule-types", label: "Rule Types", icon: Tag },
              ] : isDiners ? [
                { to: "/diners/preferences", label: "Diner Preferences", icon: Settings },
              ] : isDayEnd ? [
                { to: "/reporting", label: "Reporting", icon: FileText },
              ] : [];

              const linkEl = (
                <Link
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center justify-center h-10 w-full rounded-lg transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  {iconEl}
                </Link>
              );

              if (hasSub && subItems.length > 0) {
                return (
                  <HoverCard key={item.path} openDelay={80} closeDelay={120}>
                    <HoverCardTrigger asChild>{linkEl}</HoverCardTrigger>
                    <HoverCardContent side="right" align="start" sideOffset={8} className="w-56 p-1.5">
                      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
                        {item.label}
                      </div>
                      <div className="space-y-0.5">
                        {subItems.map((sub) => (
                          <Link
                            key={sub.to}
                            to={sub.to}
                            onClick={() => setSidebarOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <sub.icon className="h-3.5 w-3.5 shrink-0" />
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              }

              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Collapsible
                key={item.path}
                open={hasSub ? openGroup === groupKey : false}
                onOpenChange={(v) => { if (hasSub && groupKey) setOpenGroup(v ? groupKey : null); }}
              >
                <div className="flex items-center">
                  <Link
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex-1 flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {typeof item.icon === 'object' && 'light' in item.icon ? (
                      <img src={theme === 'dark' ? item.icon.dark : item.icon.light} className="h-4 w-4 shrink-0" alt="" />
                    ) : typeof item.icon === 'string' ? (
                      <img src={item.icon} className="h-4 w-4 shrink-0" alt="" />
                    ) : (
                      <item.icon className="h-4 w-4 shrink-0" />
                    )}
                    {item.label}
                  </Link>
                  {hasSub && (
                    <CollapsibleTrigger className="p-2 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors group">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                  )}
                </div>
                {isMenuBuilder && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    <Link to="/menu?import=true" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                      <Upload className="h-3 w-3" />
                      Import
                    </Link>
                    <Link to="/menu?enhance=true" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                      <ImagePlus className="h-3 w-3" />
                      Enhance Images
                    </Link>
                    <Link to="/modifiers" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                      <SlidersHorizontal className="h-3 w-3" />
                      Modifiers
                    </Link>
                  </CollapsibleContent>
                )}
                {isOrders && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    <Link to="/orders/statuses" onClick={() => setSidebarOpen(false)} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors", location.pathname === "/orders/statuses" ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                      <Monitor className="h-3 w-3" />
                      Order Display System
                    </Link>
                    <Link to="/orders/throttling" onClick={() => setSidebarOpen(false)} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors", location.pathname === "/orders/throttling" ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                      <Sliders className="h-3 w-3" />
                      Operational Throttling
                    </Link>
                  </CollapsibleContent>
                )}
                {isPricing && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    <Link to="/rule-types" onClick={() => setSidebarOpen(false)} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors", location.pathname === "/rule-types" ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                      <Tag className="h-3 w-3" />
                      Rule Types
                    </Link>
                  </CollapsibleContent>
                )}
                {isDiners && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    <Link to="/diners/preferences" onClick={() => setSidebarOpen(false)} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors", location.pathname === "/diners/preferences" ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                      <Settings className="h-3 w-3" />
                      Diner Preferences
                    </Link>
                  </CollapsibleContent>
                )}
                {isDayEnd && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    <Link to="/reporting" onClick={() => setSidebarOpen(false)} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors", location.pathname === "/reporting" ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                      <FileText className="h-3 w-3" />
                      Reporting
                    </Link>
                  </CollapsibleContent>
                )}
                {isSettings && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    {[
                      { to: "/settings?tab=details", label: "Details", icon: Settings },
                      { to: "/settings?tab=users", label: "Users", icon: Users },
                      { to: "/settings?tab=loyalty", label: "Loyalty", icon: Gift },
                      { to: "/settings?tab=sippa", label: "H&L OrderNOW AI", icon: Bot },
                      { to: "/settings?tab=payments", label: "Payments", icon: CreditCard },
                      { to: "/settings?tab=gratuities", label: "Gratuities", icon: DollarSign },
                      { to: "/settings?tab=surcharges", label: "Surcharges", icon: Percent },
                      { to: "/settings?tab=taxes", label: "Taxes", icon: Receipt },
                      { to: "/settings?tab=table-sessions", label: "Table Sessions", icon: Users },
                      { to: "/settings?tab=integrations", label: "Integrations", icon: Plug },
                    ].map((sub) => {
                      const params = new URLSearchParams(location.search);
                      const currentTab = params.get("tab") || "details";
                      const subTab = new URL(sub.to, "http://x").searchParams.get("tab") || "details";
                      const subActive = location.pathname === "/settings" && currentTab === subTab;
                      return (
                        <Link
                          key={sub.to}
                          to={sub.to}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors",
                            subActive
                              ? "bg-sidebar-accent text-sidebar-primary font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <sub.icon className="h-3 w-3" />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          })}

          {showGroupNav && (
            <>
              {!pinned && (
                <div className="pt-3 pb-1 px-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Group</span>
                </div>
              )}
              {groupNavItems.map((item) => {
                const active = location.pathname === item.path;
                if (pinned) {
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "flex items-center justify-center h-10 w-full rounded-lg transition-colors",
                            active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}

          {isTablessAdmin && (
            <>
              {!pinned && (
                <div className="pt-3 pb-1 px-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Admin</span>
                </div>
              )}
              {adminNavItems.map((item) => {
                const active = location.pathname.startsWith(item.path);
                if (pinned) {
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "flex items-center justify-center h-10 w-full rounded-lg transition-colors",
                            active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card lg:px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">
            {location.pathname === "/knowledge-base" ? "Knowledge Base" : location.pathname === "/orders/statuses" ? "Order Display System" : allNavItems.find((i) => i.path === location.pathname)?.label || "H&L OrderNOW"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {showSelfOnboard && (
              <Link
                to="/self-onboard"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Self Onboard"
              >
                <Sparkles className="h-4 w-4" />
                Self Onboard
              </Link>
            )}
            <Link to="/knowledge-base" className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" title="Knowledge Base">
              <HelpCircle className="h-5 w-5" />
            </Link>
            {showVenueNav && perms.can("copilot") && <CoPilotButton onClick={() => setCopilotOpen(true)} />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors">
                  <User className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline truncate max-w-[160px]">{user?.email}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
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
      <CoPilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />
    )}
    </>
  );
}
