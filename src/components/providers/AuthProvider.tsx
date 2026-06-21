"use client";

import { useState, useCallback, type ReactNode } from "react";
import { AuthContext } from "@/hooks/useAuth";
import { mockUsers, mockCredentials } from "@/data/users";
import type { User } from "@/types/user";

function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}

function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const remembered = safeGetItem("navi_remember") === "true";
    const stored = remembered ? safeGetItem("navi_user") : null;
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean): Promise<boolean> => {
    const remember = rememberMe ?? true;
    if (mockCredentials[email] && mockCredentials[email] === password) {
      const found = mockUsers.find((u) => u.email === email);
      if (found) {
        setUser(found);
        safeSetItem("navi_user", JSON.stringify(found));
        safeSetItem("navi_remember", String(remember));
        return true;
      }
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    safeRemoveItem("navi_user");
    safeRemoveItem("navi_remember");
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
