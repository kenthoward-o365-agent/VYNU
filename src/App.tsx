import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

import { VenueProvider, useVenue } from "@/contexts/VenueContext";
import { VenueChooserModal } from "@/components/VenueChooserModal";
import { AuditDateProvider } from "@/contexts/AuditDateContext";
import DashboardLayout from "@/components/DashboardLayout";
import Auth from "@/pages/Auth";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "@/pages/Dashboard";
import MenuBuilder from "@/pages/MenuBuilder";
import Tables from "@/pages/Tables";
import Orders from "@/pages/Orders";
import Pricing from "@/pages/Pricing";
import Analytics from "@/pages/Analytics";
import SippaAnalyticsPage from "@/pages/SippaAnalytics";
import VenueSettings from "@/pages/VenueSettings";
import LandingPageEditor from "@/pages/LandingPageEditor";
import RuleTypes from "@/pages/RuleTypes";
import Diners from "@/pages/Diners";

import GroupDashboard from "@/pages/GroupDashboard";
import AdminVenues from "@/pages/AdminVenues";
import AdminVenueDetail from "@/pages/AdminVenueDetail";
import AdminStaff from "@/pages/AdminStaff";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminPartners from "@/pages/AdminPartners";
import AdminIntegrations from "@/pages/AdminIntegrations";
import AdminKnowledgeBase from "@/pages/AdminKnowledgeBase";

import Developers from "@/pages/Developers";
import NotFound from "@/pages/NotFound";
import ConsumerOrder from "@/pages/ConsumerOrder";
import ResetPassword from "@/pages/ResetPassword";
import Modifiers from "@/pages/Modifiers";
import DinerPreferences from "@/pages/DinerPreferences";
import KnowledgeBase from "@/pages/KnowledgeBase";
import Reporting from "@/pages/Reporting";
import OrderStatuses from "@/pages/OrderStatuses";
import OrderThrottling from "@/pages/OrderThrottling";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute - data considered fresh
      gcTime: 5 * 60_000, // 5 minutes - keep cached after unmount
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { venue, venues, loading: venueLoading, isTablessAdmin, hasProvisioningResolved, needsVenueChoice } = useVenue();
  const hasVenueContext = !!venue;

  useEffect(() => {
    if (!user || !hasProvisioningResolved || venue || isTablessAdmin) return;
    // User has multiple venues but hasn't picked one yet — let the chooser handle it.
    if (needsVenueChoice || venues.length > 0) return;

    sessionStorage.setItem("shyndig_not_provisioned", "1");
    void supabase.auth.signOut();
  }, [user?.id, hasProvisioningResolved, venue?.id, isTablessAdmin, needsVenueChoice, venues.length]);

  if (authLoading || venueLoading || !hasProvisioningResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">H&L OrderNOW</h2>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }

  if (!venue && !isTablessAdmin) {
    // Multi-venue user awaiting selection — VenueChooserModal will display.
    if (needsVenueChoice || venues.length > 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Choose a venue</h2>
            <p className="text-muted-foreground">Select a venue to continue.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Signing out…</p>
        </div>
      </div>
    );
  }

  const defaultRoute = hasVenueContext ? "/dashboard" : isTablessAdmin ? "/admin/dashboard" : "/dashboard";

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/dashboard" element={hasVenueContext ? <Dashboard /> : isTablessAdmin ? <Navigate to="/admin/dashboard" replace /> : <Dashboard />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/menu" element={<MenuBuilder />} />
        <Route path="/modifiers" element={<Modifiers />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/statuses" element={<OrderStatuses />} />
        <Route path="/orders/throttling" element={<OrderThrottling />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/rule-types" element={<RuleTypes />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/sippa-analytics" element={<SippaAnalyticsPage />} />
        <Route path="/diners" element={<Diners />} />
        <Route path="/diners/preferences" element={<DinerPreferences />} />
        <Route path="/loyalty" element={<Navigate to="/settings" replace />} />
        <Route path="/group" element={<GroupDashboard />} />
        <Route path="/admin/venues" element={<AdminVenues />} />
        <Route path="/admin/venues/:venueId" element={<AdminVenueDetail />} />
        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/admin/partners" element={<AdminPartners />} />
        <Route path="/admin/integrations" element={<AdminIntegrations />} />
        <Route path="/admin/knowledge-base" element={<AdminKnowledgeBase />} />
        
        <Route path="/settings" element={<VenueSettings />} />
        <Route path="/settings/landing-page" element={<LandingPageEditor />} />
        <Route path="/reporting" element={<Reporting />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
}

function isPasswordRecoveryLocation(search: string, hash: string) {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  return searchParams.get("type") === "recovery" || hashParams.get("type") === "recovery";
}

function RootRoutes() {
  const location = useLocation();

  if (location.pathname !== "/reset-password" && isPasswordRecoveryLocation(location.search, location.hash)) {
    return <Navigate to={{ pathname: "/reset-password", search: location.search, hash: location.hash }} replace />;
  }

  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/order/:venueId/:tableId" element={<ConsumerOrder />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/developers" element={<Developers />} />
      {/* All other routes go through auth */}
      <Route path="/*" element={
        <AuthProvider>
          <VenueProvider>
            <AuditDateProvider>
              <AppRoutes />
              <VenueChooserModal />
            </AuditDateProvider>
          </VenueProvider>
        </AuthProvider>
      } />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RootRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
