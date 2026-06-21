"use client";

import { useState, useEffect, type ReactNode } from "react";
import { createClient } from "@/lib/supabase-client";
import { AuthContext } from "@/hooks/useAuth";
import type { User } from "@/types/user";

function mapSupabaseUser(sbUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): User {
  return {
    id: sbUser.id,
    name: (sbUser.user_metadata?.full_name as string) || sbUser.email || "Unknown",
    email: sbUser.email || "",
    role: (sbUser.user_metadata?.role as User["role"]) || "viewer",
    campus_id: (sbUser.user_metadata?.campus_id as string) || null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
        setIsAuthenticated(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
