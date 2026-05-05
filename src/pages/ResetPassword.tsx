import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

function getPasswordStrength(pw: string) {
  const checks = [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(pw) },
    { label: "Contains lowercase letter", met: /[a-z]/.test(pw) },
    { label: "Contains a number", met: /\d/.test(pw) },
    { label: "Contains special character", met: /[^A-Za-z0-9]/.test(pw) },
  ];
  return { score: checks.filter((c) => c.met).length, checks };
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);

  const strength = getPasswordStrength(password);
  const strengthColor = strength.score <= 2 ? "bg-destructive" : strength.score <= 3 ? "bg-yellow-500" : "bg-green-500";
  const isValid = password.length >= 8 && strength.score >= 3;

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecoverySessionReady(!!session);
        setReady(true);
      }
    });

    const init = async () => {
      const hash = window.location.hash;
      let isRecoveryFlow = false;

      // PKCE-style recovery link: ?code=...
      const search = new URLSearchParams(window.location.search);
      const code = search.get("code");
      const searchType = search.get("type");
      if (code) {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) setError(exchErr.message);
        isRecoveryFlow = !exchErr && (!searchType || searchType === "recovery");
      } else if (hash.includes("access_token") && hash.includes("type=recovery")) {
        // Implicit-flow recovery link: tokens in URL hash
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
          if (setErr) setError(setErr.message);
          isRecoveryFlow = !setErr;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setRecoverySessionReady(!!session && isRecoveryFlow);
      setReady(true);
    };

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    if (!isValid) return;
    if (!recoverySessionReady) {
      setError("Your reset link has expired or is invalid. Please request a new password reset email.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your reset link has expired or is invalid. Please request a new password reset email.");

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast.success("Password updated successfully!");
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Verifying reset link...</h2>
          <p className="text-sm text-muted-foreground">If this takes too long, the link may have expired. Please request a new one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-4">
          <img src="/brand/shyndig-icon.png" alt="Shyndig" className="h-16 w-16 mx-auto" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Choose a secure new password for your account.</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">New Password</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {password && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.score ? strengthColor : "bg-muted"}`} />
                  ))}
                </div>
                <div className="space-y-1">
                  {strength.checks.map((check) => (
                    <div key={check.label} className="flex items-center gap-1.5 text-xs">
                      {check.met ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-muted-foreground" />}
                      <span className={check.met ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={!isValid || submitting} className="w-full h-12 text-base rounded-xl">
            {submitting ? "Updating..." : "Update Password"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
