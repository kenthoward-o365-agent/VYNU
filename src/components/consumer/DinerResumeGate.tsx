import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DinerResumeGateProps {
  firstName: string | null;
  email: string | null;
  onContinue: (password: string) => Promise<void>;
  onSwitchAccount: () => void;
}

export default function DinerResumeGate({ firstName, email, onContinue, onSwitchAccount }: DinerResumeGateProps) {
  const displayName = firstName?.trim() || email?.split("@")[0] || "there";
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onContinue(password);
    } catch (err: any) {
      setError(err?.message || "Incorrect password. Please try again.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email || sendingReset) return;
    setSendingReset(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      toast.success("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      toast.error(err?.message || "Could not send reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-6">
      <Card className="w-full max-w-sm p-6 space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <UserCircle2 className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Welcome back, {displayName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please enter your password to continue.
            </p>
            {email && (
              <p className="text-xs text-muted-foreground mt-2 truncate">{email}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="resume-password" className="text-sm">Password</Label>
            <Input
              id="resume-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={submitting}
              placeholder="Your password"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={!password || submitting}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying…</>
            ) : (
              <>Continue as {displayName}</>
            )}
          </Button>
        </form>

        <div className="flex flex-col gap-1 text-center">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-xs h-auto"
            onClick={handleForgotPassword}
            disabled={sendingReset || !email}
          >
            {sendingReset ? "Sending…" : "Forgot password?"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm"
            onClick={onSwitchAccount}
            disabled={submitting}
          >
            Not you? Sign in with a different account
          </Button>
        </div>
      </Card>
    </div>
  );
}
