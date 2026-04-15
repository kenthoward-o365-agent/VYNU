import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const { theme } = useTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(false);

  const logoSrc = theme === "dark" ? "/ordrup-icon-dark.svg" : "/ordrup-icon.svg";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, displayName);
        toast.success("Account created! Check your email to confirm.");
      } else {
        // Validate site ID before signing in
        const trimmed = siteId.trim().toUpperCase();
        if (!trimmed) {
          toast.error("Please enter your Site ID");
          setLoading(false);
          return;
        }

        const { data: venueData, error: lookupError } = await supabase.rpc("lookup_venue_by_site_id", { _site_id: trimmed });
        if (lookupError || !venueData || venueData.length === 0) {
          toast.error("Invalid Site ID. Please check and try again.");
          setLoading(false);
          return;
        }

        // Store the target venue ID so VenueContext picks it up after login
        localStorage.setItem("tabless_active_venue", venueData[0].venue_id);
        await signIn(email, password);
        toast.success("Welcome back!");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <img src={logoSrc} alt="Ordrup" className="h-16 w-16 mx-auto" />
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">Ordrup</h1>
            <p className="text-muted-foreground">The world's first agentic dining platform</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{isSignUp ? "Create your venue account" : "Welcome back"}</CardTitle>
            <CardDescription>
              {isSignUp ? "Set up your venue on Ordrup" : "Enter your Site ID and credentials to sign in"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <Input
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              )}
              {!isSignUp && (
                <div>
                  <Input
                    id="site-id"
                    name="organization"
                    autoComplete="organization"
                    placeholder="Venue ID (e.g. 1000)"
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    required
                    className="font-mono tracking-wider"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Your venue's unique Site ID — provided by your administrator</p>
                </div>
              )}
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
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Already have an account? Sign in" : "New venue? Create an account"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
