import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isPasswordAcceptable, WEAK_PASSWORD_MESSAGE } from "@/lib/password";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!isPasswordAcceptable(password)) {
      throw new Error(WEAK_PASSWORD_MESSAGE);
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { display_name: displayName } },
    });
    if (error) throw error;
    // After signup, create venue + staff record is handled in onboarding
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear app-owned USER state so it does not leak into the next
    // session (e.g. a different user logging in on the same browser).
    // Theme preference (`tabless-theme`) is intentionally preserved.
    // NOTE: the POS terminal pairing token (`shyndig_terminal_token`) is
    // DEVICE state, not user state — it must survive sign-out / idle-logout,
    // otherwise a shared terminal would need re-pairing on every logout.
    try {
      localStorage.removeItem("tabless_active_venue");
      localStorage.removeItem("shyndig_sidebar_pinned");
    } catch {
      // ignore storage access errors (e.g. privacy mode)
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
