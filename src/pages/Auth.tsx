import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const createSessionClient = (accessToken: string) =>
  createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(false);
  const [notProvisioned, setNotProvisioned] = useState(false);
  const navigate = useNavigate();

  /**
   * Send a freshly signed-in user to "/", which AppRoutes redirects to the right
   * landing page for them — /admin/dashboard for platform admins, /dashboard for
   * operators. Without this the router simply re-renders at whatever path the
   * sign-in happened on: this screen answers `path="*"` while logged out, so
   * signing in at a URL the authenticated router does not define (/login being
   * the obvious one) lands on NotFound instead of the app.
   */
  const goToLandingPage = () => navigate("/", { replace: true });

  const logoSrc = "/brand/vynu-logo.svg";

  useEffect(() => {
    if (sessionStorage.getItem("shyndig_not_provisioned") === "1") {
      setNotProvisioned(true);
      sessionStorage.removeItem("shyndig_not_provisioned");
    }
    if (sessionStorage.getItem("idle_logout") === "1") {
      sessionStorage.removeItem("idle_logout");
      toast.info("You were signed out due to inactivity. Please sign in again.");
    }
  }, []);

  const handleResetPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email above first");
      return;
    }
    // Always show the same neutral message regardless of outcome, so the
    // response does not reveal whether an account exists (enumeration).
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    toast.success("If an account exists for that email, a reset link has been sent.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotProvisioned(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      if (!data.session || !data.user) throw new Error("Sign-in failed");

      const sessionClient = createSessionClient(data.session.access_token);

      const { data: roles, error: rolesError } = await sessionClient
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      if (rolesError) throw rolesError;

      const isAdmin = roles?.some((r) => r.role === "tabless_admin") ?? false;

      const trimmedSiteId = siteId.trim().toUpperCase();

      // Admins may sign in without a Site ID to reach the platform Admin
      // section. Supplying one puts them into that venue through the same
      // staff check as any operator — so they land on their staff role there,
      // not on elevated access.
      if (!trimmedSiteId) {
        if (isAdmin) {
          localStorage.removeItem("tabless_active_venue");
          toast.success("Welcome, VYNU admin");
          goToLandingPage();
          return;
        }
        await supabase.auth.signOut();
        toast.error("Site ID is required for venue operators");
        return;
      }

      const { data: venueData, error: lookupError } = await sessionClient.rpc("lookup_venue_by_site_id", {
        _site_id: trimmedSiteId,
      });

      // Use one neutral message for both "no such Site ID" and "you don't
      // have access to it" so an operator cannot enumerate which Site IDs
      // exist by probing the response.
      const SIGNIN_FAILED = "We couldn't sign you in. Please check your email, password, and Site ID.";

      // An admin who mistypes a Site ID, or names a venue they have no staff
      // row at, still has a valid platform-admin session — drop them at the
      // Admin section rather than bouncing them out entirely. No enumeration
      // concern: the Admin section lists every venue anyway.
      const failSignIn = async () => {
        if (isAdmin) {
          localStorage.removeItem("tabless_active_venue");
          toast.error("No venue access for that Site ID — signed in as VYNU admin");
          goToLandingPage();
          return;
        }
        await supabase.auth.signOut();
        toast.error(SIGNIN_FAILED);
      };

      if (lookupError || !venueData || venueData.length === 0) {
        await failSignIn();
        return;
      }

      const targetVenueId = venueData[0].venue_id;

      // Verify the user actually has access to that venue before pinning it
      const { data: staffRow } = await sessionClient
        .from("venue_staff")
        .select("venue_id")
        .eq("user_id", data.user.id)
        .eq("venue_id", targetVenueId)
        .eq("is_active", true)
        .maybeSingle();

      if (!staffRow) {
        await failSignIn();
        return;
      }

      // Pin as primary so future logins land here automatically
      await sessionClient.rpc("set_primary_venue", { _venue_id: targetVenueId });
      localStorage.setItem("tabless_active_venue", targetVenueId);
      toast.success("Welcome back!");
      goToLandingPage();
    } catch (err: any) {
      toast.error(err.message ?? "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <img src={logoSrc} alt="VYNU" className="h-48 w-auto max-w-[640px] mx-auto object-contain" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            {notProvisioned && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Account not provisioned. Please contact your venue administrator to be granted access.
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  id="site-id"
                  name="organization"
                  autoComplete="organization"
                  placeholder="Venue ID (e.g. 1000)"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="font-mono tracking-wider"
                />
                
              </div>
              <Input
                id="email"
                name="username"
                type="email"
                autoComplete="username"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : "Sign In"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
