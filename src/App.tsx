import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
import VenueSettings from "@/pages/VenueSettings";
import Diners from "@/pages/Diners";
import Loyalty from "@/pages/Loyalty";
import GroupDashboard from "@/pages/GroupDashboard";
import NotFound from "@/pages/NotFound";
import ConsumerOrder from "@/pages/ConsumerOrder";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { venue, loading: venueLoading } = useVenue();

  if (authLoading || venueLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Tab-Less</h2>
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

  if (!venue) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/menu" element={<MenuBuilder />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/diners" element={<Diners />} />
        <Route path="/loyalty" element={<Loyalty />} />
        <Route path="/group" element={<GroupDashboard />} />
        <Route path="/settings" element={<VenueSettings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public consumer ordering route — no auth required */}
          <Route path="/order/:venueId/:tableId" element={<ConsumerOrder />} />
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
  </QueryClientProvider>
);

export default App;
