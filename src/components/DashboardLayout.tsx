import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import {
  LayoutDashboard, UtensilsCrossed, Tag, QrCode, ClipboardList,
  TrendingUp, Settings, LogOut, Menu, X, ChevronDown, Users, Building2, Check, Sun, Moon, Shield, Sparkles, Upload, ImagePlus, SlidersHorizontal, Gift, Bot, BarChart3, CreditCard, Receipt, HelpCircle, DollarSign, Percent, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface NavItem {
  path: string;
  label: string;
  icon: any;
  hasSub?: boolean;
}

const venueNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/sippa-analytics", label: "Ordrup AI Analytics", icon: BarChart3 },
  { path: "/menu", label: "Menu Builder", icon: UtensilsCrossed, hasSub: true },
  { path: "/pricing", label: "Pricing", icon: Tag, hasSub: true },
  { path: "/tables", label: "Tables & QR", icon: QrCode },
  { path: "/orders", label: "Orders", icon: ClipboardList },
  { path: "/analytics", label: "Analytics", icon: TrendingUp },
  { path: "/diners", label: "Diners", icon: Users, hasSub: true },
  { path: "/settings", label: "Settings", icon: Settings, hasSub: true },
];

const groupNavItems = [
  { path: "/group", label: "Parent Company", icon: Building2 },
];

const adminNavItems = [
  { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/venues", label: "Manage Venues", icon: Shield },
  { path: "/admin/staff", label: "Platform Staff", icon: Shield },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const { venue, venues, group, isGroupAdmin, isTablessAdmin, switchVenue } = useVenue();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showGroupNav = !isTablessAdmin && isGroupAdmin;
  const allNavItems = [
    ...(isTablessAdmin ? [] : venueNavItems),
    ...(showGroupNav ? groupNavItems : []),
    ...(isTablessAdmin ? adminNavItems : []),
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0",
        "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <img src={theme === "dark" ? "/ordrup-icon-dark.svg" : "/ordrup-icon.svg"} alt="Ordrup" className="h-8 w-8" />
              <span className="text-lg font-bold text-sidebar-foreground">Ordrup</span>
            </div>
            <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Venue Switcher — hidden for platform admins */}
          {!isTablessAdmin && (venues.length > 1 ? (
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

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {!isTablessAdmin && venueNavItems.map((item) => {
            const active = location.pathname === item.path || (item.path === "/settings" && location.pathname.startsWith("/settings")) || (item.path === "/diners" && location.pathname.startsWith("/diners")) || (item.path === "/pricing" && location.pathname === "/menu-times");
            const isMenuBuilder = item.path === "/menu";
            const isDiners = item.path === "/diners";
            const isSettings = item.path === "/settings";
            const isPricing = item.path === "/pricing";
            const hasSub = isMenuBuilder || isDiners || isSettings || isPricing;
            return (
              <Collapsible key={item.path} defaultOpen={
                (isDiners && location.pathname.startsWith("/diners/")) ||
                (isSettings && location.pathname === "/settings") ||
                false
              }>
                <div className="flex items-center">
                  <Link
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
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
                {isSettings && (
                  <CollapsibleContent className="pl-10 space-y-0.5">
                    {[
                      { to: "/settings?tab=details", label: "Details", icon: Settings },
                      { to: "/settings?tab=users", label: "Users", icon: Users },
                      { to: "/settings?tab=loyalty", label: "Loyalty", icon: Gift },
                      { to: "/settings?tab=sippa", label: "Ordrup AI", icon: Bot },
                      { to: "/settings?tab=payments", label: "Payments", icon: CreditCard },
                      { to: "/settings?tab=gratuities", label: "Gratuities", icon: DollarSign },
                      { to: "/settings?tab=surcharges", label: "Surcharges", icon: Percent },
                      { to: "/settings?tab=taxes", label: "Taxes", icon: Receipt },
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
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Group</span>
              </div>
              {groupNavItems.map((item) => {
                const active = location.pathname === item.path;
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
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Admin</span>
              </div>
              {adminNavItems.map((item) => {
                const active = location.pathname.startsWith(item.path);
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

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-sidebar-muted">
              {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              <span>{theme === "dark" ? "Dark" : "Light"}</span>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
              className="data-[state=checked]:bg-sidebar-primary data-[state=unchecked]:bg-sidebar-accent"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-sidebar-muted">
            <span className="truncate">{user?.email}</span>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card lg:px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">
            {location.pathname === "/knowledge-base" ? "Knowledge Base" : allNavItems.find((i) => i.path === location.pathname)?.label || "Ordrup"}
          </h1>
          <div className="ml-auto">
            <Link to="/knowledge-base" className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" title="Knowledge Base">
              <HelpCircle className="h-5 w-5" />
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
