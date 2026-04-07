import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVenue } from "@/contexts/VenueContext";
import {
  LayoutDashboard, UtensilsCrossed, Tag, QrCode, ClipboardList,
  TrendingUp, Settings, LogOut, Menu, X, ChevronDown, Users, Gift, Building2, Check, Sun, Moon, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const venueNavItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/menu", label: "Menu Builder", icon: UtensilsCrossed },
  { path: "/pricing", label: "Pricing", icon: Tag },
  { path: "/tables", label: "Tables & QR", icon: QrCode },
  { path: "/orders", label: "Orders", icon: ClipboardList },
  { path: "/analytics", label: "Analytics", icon: TrendingUp },
  { path: "/diners", label: "Diners", icon: Users },
  { path: "/loyalty", label: "Loyalty", icon: Gift },
  { path: "/settings", label: "Settings", icon: Settings },
];

const groupNavItems = [
  { path: "/group", label: "Parent Company", icon: Building2 },
];

const adminNavItems = [
  { path: "/admin/venues", label: "Manage Venues", icon: Shield },
  { path: "/admin/staff", label: "Platform Staff", icon: Shield },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const { venue, venues, group, isGroupAdmin, isTablessAdmin, switchVenue } = useVenue();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showGroupNav = !isTablessAdmin && (isGroupAdmin || venues.length > 1);
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
            <h2 className="text-lg font-bold text-sidebar-primary-foreground">Tab-Less</h2>
            <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Venue Switcher */}
          {venues.length > 1 ? (
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
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {venueNavItems.map((item) => {
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

          {(isGroupAdmin || venues.length > 1) && (
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
            {allNavItems.find((i) => i.path === location.pathname)?.label || "Tab-Less"}
          </h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
