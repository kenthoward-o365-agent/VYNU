import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Check, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface DinerSignupProps {
  venueId: string;
  onComplete: () => void;
  onBack: () => void;
  initialMode?: "signup" | "signin";
}

const COUNTRY_CODES = [
  { code: "+61", country: "AU", label: "Australia", format: "### ### ###" },
  { code: "+64", country: "NZ", label: "New Zealand", format: "## ### ####" },
  { code: "+1", country: "US", label: "United States", format: "(###) ###-####" },
  { code: "+1", country: "CA", label: "Canada", format: "(###) ###-####" },
  { code: "+44", country: "GB", label: "United Kingdom", format: "#### ######" },
  { code: "+353", country: "IE", label: "Ireland", format: "## ### ####" },
  { code: "+91", country: "IN", label: "India", format: "##### #####" },
  { code: "+65", country: "SG", label: "Singapore", format: "#### ####" },
  { code: "+852", country: "HK", label: "Hong Kong", format: "#### ####" },
  { code: "+81", country: "JP", label: "Japan", format: "##-####-####" },
  { code: "+86", country: "CN", label: "China", format: "### #### ####" },
  { code: "+82", country: "KR", label: "South Korea", format: "##-####-####" },
  { code: "+60", country: "MY", label: "Malaysia", format: "##-### ####" },
  { code: "+66", country: "TH", label: "Thailand", format: "##-###-####" },
  { code: "+63", country: "PH", label: "Philippines", format: "### ### ####" },
  { code: "+49", country: "DE", label: "Germany", format: "### #######" },
  { code: "+33", country: "FR", label: "France", format: "# ## ## ## ##" },
  { code: "+39", country: "IT", label: "Italy", format: "### ### ####" },
  { code: "+34", country: "ES", label: "Spain", format: "### ## ## ##" },
  { code: "+971", country: "AE", label: "UAE", format: "## ### ####" },
  { code: "+27", country: "ZA", label: "South Africa", format: "## ### ####" },
  { code: "+55", country: "BR", label: "Brazil", format: "(##) #####-####" },
];

function formatPhone(raw: string, format: string): string {
  const digits = raw.replace(/\D/g, "");
  let result = "";
  let di = 0;
  for (const ch of format) {
    if (di >= digits.length) break;
    if (ch === "#") {
      result += digits[di++];
    } else {
      result += ch;
    }
  }
  return result;
}

function getPasswordStrength(pw: string): { score: number; checks: { label: string; met: boolean }[] } {
  const checks = [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(pw) },
    { label: "Contains lowercase letter", met: /[a-z]/.test(pw) },
    { label: "Contains a number", met: /\d/.test(pw) },
    { label: "Contains special character", met: /[^A-Za-z0-9]/.test(pw) },
  ];
  return { score: checks.filter((c) => c.met).length, checks };
}

const DinerSignup = ({ venueId, onComplete, onBack, initialMode = "signup" }: DinerSignupProps) => {
  const [mode, setMode] = useState<"signup" | "signin">(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const strengthColor = strength.score <= 2 ? "bg-destructive" : strength.score <= 3 ? "bg-yellow-500" : "bg-green-500";

  const formattedPhone = useMemo(() => formatPhone(phone, selectedCountry.format), [phone, selectedCountry]);

  const handlePhoneChange = (val: string) => {
    setPhone(val.replace(/\D/g, ""));
  };

  const filteredCountries = COUNTRY_CODES.filter((c) =>
    countrySearch ? c.label.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.includes(countrySearch) || c.country.toLowerCase().includes(countrySearch.toLowerCase()) : true
  );

  const isSignupValid = firstName.trim() && lastName.trim() && email.trim() && password.length >= 8 && strength.score >= 3;
  const isSigninValid = email.trim() && password.length >= 1;

  const handleSignIn = async () => {
    if (!isSigninValid) return;
    setSubmitting(true);
    setError("");

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;
      if (!data.user) throw new Error("Sign in failed");

      // Record visit if diner profile exists
      const { data: profile } = await supabase
        .from("diner_profiles")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profile) {
        await supabase.from("diner_visits").insert({
          diner_id: profile.id,
          venue_id: venueId,
        });
      }

      toast.success("Welcome back! 👋");
      onComplete();
    } catch (err: any) {
      console.error("Sign in error:", err);
      setError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!isSignupValid) return;
    setSubmitting(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Signup failed");

      const fullPhone = phone ? `${selectedCountry.code}${phone}` : null;
      const { data: profile, error: profileError } = await supabase
        .from("diner_profiles")
        .insert({
          user_id: authData.user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim(),
          phone: fullPhone,
          country_code: selectedCountry.code,
        } as any)
        .select()
        .single();

      if (profileError) throw profileError;

      // Fetch venue-level loyalty programs
      const { data: venuePrograms } = await supabase
        .from("loyalty_programs")
        .select("id, rules")
        .eq("venue_id", venueId)
        .eq("is_active", true);

      // Fetch group-level loyalty programs (if venue belongs to a group with global_loyalty)
      let groupPrograms: any[] = [];
      const { data: venueData } = await supabase
        .from("venues")
        .select("group_id, settings")
        .eq("id", venueId)
        .single();
      if (venueData?.group_id) {
        const { data: grp } = await supabase
          .from("venue_groups")
          .select("settings")
          .eq("id", venueData.group_id)
          .single();
        const grpSettings = (grp?.settings && typeof grp.settings === "object") ? grp.settings as any : {};
        if (grpSettings.global_loyalty) {
          const { data: gProgs } = await supabase
            .from("loyalty_programs")
            .select("id, rules")
            .eq("group_id", venueData.group_id)
            .eq("is_active", true);
          groupPrograms = gProgs || [];
        }
      }

      const allPrograms = [...(venuePrograms || []), ...groupPrograms];
      if (allPrograms.length > 0 && profile) {
        const enrollments = allPrograms.map((prog: any) => {
          const rules = prog.rules && typeof prog.rules === "object" ? prog.rules : {};
          const signupBonus = (rules as any).signup_bonus || 0;
          return {
            diner_id: profile.id,
            program_id: prog.id,
            balance: signupBonus,
          };
        });

        await supabase.from("loyalty_balances").insert(enrollments);
      }

      if (profile) {
        await supabase.from("diner_visits").insert({
          diner_id: profile.id,
          venue_id: venueId,
        });
      }

      toast.success("Welcome! Your account is ready 🎉");
      onComplete();
    } catch (err: any) {
      console.error("Signup error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setResetSent(true);
      toast.success("Password reset link sent to your email");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = mode === "signin" ? handleSignIn : handleSignUp;

  // ── Sign In View ──
  if (mode === "signin") {
    return (
      <div className="min-h-screen bg-background px-5 py-6 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-1 -ml-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Welcome Back</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Sign in to access your rewards, saved preferences, and order history.
        </p>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Password</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
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
          </div>

          {resetSent ? (
            <div className="bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm rounded-xl p-3">
              Check your email for a password reset link. It may take a minute to arrive.
            </div>
          ) : (
            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={submitting}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!isSigninValid || submitting} className="w-full h-12 text-base rounded-xl mt-2">
            {submitting ? "Signing in..." : "Sign In"}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(""); }}
              className="text-primary font-medium hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Sign Up View ──
  return (
    <div className="min-h-screen bg-background px-5 py-6 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Create Account</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Sign up to earn rewards, save favourites, and speed up future orders.
      </p>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className="mt-1" />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground">Phone Number</Label>
          <div className="flex gap-2 mt-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCountryPicker(!showCountryPicker)}
                className="flex items-center gap-1 h-10 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors min-w-[90px]"
              >
                <span className="font-mono text-xs">{selectedCountry.country}</span>
                <span className="text-muted-foreground text-xs">{selectedCountry.code}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
              </button>

              {showCountryPicker && (
                <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-50">
                  <div className="p-2 sticky top-0 bg-popover border-b border-border">
                    <Input
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      placeholder="Search country..."
                      className="h-8 text-xs"
                      autoFocus
                    />
                  </div>
                  {filteredCountries.map((c, i) => (
                    <button
                      key={`${c.code}-${c.country}-${i}`}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between transition-colors"
                      onClick={() => {
                        setSelectedCountry(c);
                        setShowCountryPicker(false);
                        setCountrySearch("");
                        setPhone("");
                      }}
                    >
                      <span>{c.label}</span>
                      <span className="text-muted-foreground text-xs font-mono">{c.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Input
              type="tel"
              value={formattedPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder={selectedCountry.format.replace(/#/g, "0")}
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground">Email Address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground">Password</Label>
          <div className="relative mt-1">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a secure password"
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
                    {check.met ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={check.met ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={!isSignupValid || submitting} className="w-full h-12 text-base rounded-xl mt-2">
          {submitting ? "Creating account..." : "Create Account"}
        </Button>

        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(""); }}
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </button>
        </p>

        <p className="text-[11px] text-center text-muted-foreground">
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default DinerSignup;
