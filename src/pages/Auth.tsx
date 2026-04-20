import { useState, useEffect } from "react";
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

  const logoSrc = "/ordrup-symbol-1024.png";

  useEffect(() => {
    if (sessionStorage.getItem("ordrup_not_provisioned") === "1") {
      setNotProvisioned(true);
      sessionStorage.removeItem("ordrup_not_provisioned");
    }
  }, []);

  const handleResetPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email above first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent to your email");
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

      if (isAdmin) {
        localStorage.removeItem("tabless_active_venue");
        toast.success("Welcome, OrdrUp admin");
        return;
      }

      const trimmedSiteId = siteId.trim().toUpperCase();
      if (!trimmedSiteId) {
        await supabase.auth.signOut();
        toast.error("Site ID is required for venue operators");
        return;
      }

      const { data: venueData, error: lookupError } = await sessionClient.rpc("lookup_venue_by_site_id", {
        _site_id: trimmedSiteId,
      });

      if (lookupError || !venueData || venueData.length === 0) {
        await supabase.auth.signOut();
        toast.error("Invalid Site ID. Please check and try again.");
        return;
      }

      localStorage.setItem("tabless_active_venue", venueData[0].venue_id);
      toast.success("Welcome back!");
    } catch (err: any) {
      toast.error(err.message ?? "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <img src={logoSrc} alt="OrdrUp" className="h-16 w-16 mx-auto" />
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">OrdrUp</h1>
            <p className="text-muted-foreground">The world's first agentic Ordering Platform</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Sign in to your venue dashboard or OrdrUp admin console
            </CardDescription>
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
                <p className="text-xs text-muted-foreground mt-1">Operators: enter your venue's Site ID. OrdrUp staff: leave blank.</p>
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
            <div className="mt-6 pt-4 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                Diner? Scan your table's QR code to order — no account needed here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
