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
import { RequireFeature } from "@/components/RequireFeature";
import { RequireAdmin } from "@/components/RequireAdmin";
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
import AdminFinancials from "@/pages/AdminFinancials";
import AdminBilling from "@/pages/AdminBilling";
import BillingSetup from "@/pages/BillingSetup";

import Developers from "@/pages/Developers";
import NotFound from "@/pages/NotFound";
import ConsumerOrder from "@/pages/ConsumerOrder";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppErrorFallback, ConsumerErrorFallback } from "@/components/ErrorFallbacks";
import ResetPassword from "@/pages/ResetPassword";
import Modifiers from "@/pages/Modifiers";
import DinerPreferences from "@/pages/DinerPreferences";
import KnowledgeBase from "@/pages/KnowledgeBase";
import Reporting from "@/pages/Reporting";
import OrderStatuses from "@/pages/OrderStatuses";
import OrderThrottling from "@/pages/OrderThrottling";
import OrderSettings from "@/pages/OrderSettings";
import SelfOnboard from "@/pages/SelfOnboard";
import VenueBilling from "@/pages/VenueBilling";
import OAuthConsent from "@/pages/OAuthConsent";
import MarketingIndex from "@/pages/Index";
import Compare from "@/pages/Compare";
import Features from "@/pages/Features";

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
    if (!user) return;
    const pending = sessionStorage.getItem("pending_oauth_consent");
    if (pending && pending.startsWith("/.lovable/oauth/consent")) {
      sessionStorage.removeItem("pending_oauth_consent");
      window.location.replace(pending);
    }
  }, [user?.id]);

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
        <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/menu" element={<MenuBuilder />} />
        <Route path="/modifiers" element={<Modifiers />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/settings" element={<OrderSettings />} />
        <Route path="/orders/statuses" element={<RequireFeature feature="core.custom_order_statuses"><OrderStatuses /></RequireFeature>} />
        <Route path="/orders/throttling" element={<RequireFeature feature="core.order_throttling"><OrderThrottling /></RequireFeature>} />
        <Route path="/pricing" element={<RequireFeature feature="merch.pricing_rules"><Pricing /></RequireFeature>} />
        <Route path="/rule-types" element={<RequireFeature feature="merch.custom_rule_types"><RuleTypes /></RequireFeature>} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/sippa-analytics" element={<RequireFeature feature="ai.spark_analytics"><SippaAnalyticsPage /></RequireFeature>} />
        <Route path="/diners" element={<Diners />} />
        <Route path="/diners/preferences" element={<DinerPreferences />} />
        <Route path="/loyalty" element={<Navigate to="/settings" replace />} />
        <Route path="/group" element={<RequireFeature feature="group.dashboard"><GroupDashboard /></RequireFeature>} />
        <Route path="/admin/venues" element={<RequireAdmin><AdminVenues /></RequireAdmin>} />
        <Route path="/admin/venues/:venueId" element={<RequireAdmin><AdminVenueDetail /></RequireAdmin>} />
        <Route path="/admin/staff" element={<RequireAdmin><AdminStaff /></RequireAdmin>} />
        <Route path="/admin/partners" element={<RequireAdmin><AdminPartners /></RequireAdmin>} />
        <Route path="/admin/integrations" element={<RequireAdmin><AdminIntegrations /></RequireAdmin>} />
        <Route path="/admin/knowledge-base" element={<RequireAdmin><AdminKnowledgeBase /></RequireAdmin>} />
        <Route path="/admin/financials" element={<RequireAdmin><AdminFinancials /></RequireAdmin>} />
        <Route path="/admin/billing" element={<RequireAdmin><AdminBilling /></RequireAdmin>} />
        
        <Route path="/settings" element={<VenueSettings />} />
        <Route path="/settings/landing-page" element={<LandingPageEditor />} />
        <Route path="/reporting" element={<RequireFeature feature="reporting.advanced"><Reporting /></RequireFeature>} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/self-onboard" element={<SelfOnboard />} />
        <Route path="/billing" element={<VenueBilling />} />
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
      <Route path="/" element={<MarketingIndex />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/features" element={<Features />} />
      {/* Public routes — no auth required */}
      {/* Nested boundary: a failure inside the diner flow must not blank the
          whole app, and the diner needs a different message to an operator —
          specifically whether their order was placed. */}
      <Route
        path="/order/:venueId/:tableId"
        element={
          <ErrorBoundary scope="consumer-order" fallback={ConsumerErrorFallback}>
            <ConsumerOrder />
          </ErrorBoundary>
        }
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/developers" element={<Developers />} />
      <Route path="/billing/setup/:token" element={<BillingSetup />} />
      <Route path="/billing/setup/success" element={<BillingSetup />} />
      <Route path="/billing/setup/cancelled" element={<BillingSetup />} />
      {/* OAuth consent route for MCP / external agent integrations */}
      <Route
        path="/.lovable/oauth/consent"
        element={
          <AuthProvider>
            <OAuthConsent />
          </AuthProvider>
        }
      />
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
  <ErrorBoundary scope="app-root" fallback={AppErrorFallback}>
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
  </ErrorBoundary>
);

export default App;
