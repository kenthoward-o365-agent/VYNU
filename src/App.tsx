import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { VenueProvider, useVenue } from "@/contexts/VenueContext";
import DashboardLayout from "@/components/DashboardLayout";
import Auth from "@/pages/Auth";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import MenuBuilder from "@/pages/MenuBuilder";
import Tables from "@/pages/Tables";
import Orders from "@/pages/Orders";
import Pricing from "@/pages/Pricing";
import Analytics from "@/pages/Analytics";
import SippaAnalyticsPage from "@/pages/SippaAnalytics";
import VenueSettings from "@/pages/VenueSettings";
import LandingPageEditor from "@/pages/LandingPageEditor";
import Diners from "@/pages/Diners";

import GroupDashboard from "@/pages/GroupDashboard";
import AdminVenues from "@/pages/AdminVenues";
import AdminVenueDetail from "@/pages/AdminVenueDetail";
import AdminStaff from "@/pages/AdminStaff";
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/NotFound";
import ConsumerOrder from "@/pages/ConsumerOrder";
import ResetPassword from "@/pages/ResetPassword";
import Modifiers from "@/pages/Modifiers";
import DinerPreferences from "@/pages/DinerPreferences";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { venue, loading: venueLoading, isTablessAdmin } = useVenue();

  if (authLoading || venueLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Sippa</h2>
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
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  const defaultRoute = isTablessAdmin ? "/admin/dashboard" : "/dashboard";

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/dashboard" element={isTablessAdmin ? <Navigate to="/admin/dashboard" replace /> : <Dashboard />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/menu" element={<MenuBuilder />} />
        <Route path="/modifiers" element={<Modifiers />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/sippa-analytics" element={<SippaAnalyticsPage />} />
        <Route path="/diners" element={<Diners />} />
        <Route path="/diners/preferences" element={<DinerPreferences />} />
        <Route path="/loyalty" element={<Navigate to="/settings" replace />} />
        <Route path="/group" element={<GroupDashboard />} />
        <Route path="/admin/venues" element={<AdminVenues />} />
        <Route path="/admin/venues/:venueId" element={<AdminVenueDetail />} />
        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/settings" element={<VenueSettings />} />
        <Route path="/settings/landing-page" element={<LandingPageEditor />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes — no auth required */}
            <Route path="/order/:venueId/:tableId" element={<ConsumerOrder />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* All other routes go through auth */}
            <Route path="/*" element={
              <AuthProvider>
                <VenueProvider>
                  <AppRoutes />
                </VenueProvider>
              </AuthProvider>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
