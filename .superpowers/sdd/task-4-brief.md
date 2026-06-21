# Task 4: Rewrite AuthProvider + update useAuth + types

**Modify:**
1. `src/types/user.ts` — update AuthState interface
2. `src/hooks/useAuth.ts` — update context type
3. `src/components/providers/AuthProvider.tsx` — full rewrite

**Context:** Replace mock auth with Supabase session management. The provider subscribes to Supabase Auth state changes. Consumers are: AppLayout (uses `logout`), LoginScreen (uses `login` - will be rewritten in Task 5), admin layout (uses `isAuthenticated`), and root layout (wraps AuthProvider).

## File 1: `src/types/user.ts`

Replace the `AuthState` interface. Keep `User` interface unchanged.

Old `AuthState`:
```typescript
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => void;
}
```

New `AuthState`:
```typescript
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}
```

## File 2: `src/hooks/useAuth.ts`

Replace the contents. Update to match new AuthState interface. Import `AuthState` from `@/types/user` (or `@/types` — check which import style is used).

Full new content:
```typescript
import { createContext, useContext } from "react";
import type { AuthState } from "@/types/user";

export const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
```

## File 3: `src/components/providers/AuthProvider.tsx`

Full rewrite. Replace all mock auth logic with Supabase session management.

```typescript
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
```

## Dependencies
- `createClient` from `@/lib/supabase-client` (created in Task 1)
- `AuthContext` from `@/hooks/useAuth`
- `User` type from `@/types/user`

## Verification
```bash
cmd /c "npm run lint"
```
Expected: 0 errors (pre-existing warnings only). Note: `AppLayout` and `LoginScreen` will have type errors because they still call `.login` — these will be fixed in Tasks 5 and 6. The `LoginScreen` is in `src/app/(admin)/login/page.tsx` (imported) and `src/components/pages/LoginScreen.tsx`. Ignore any errors in those files for now.

Actually, ignore this — just run lint to check for errors in the files we modified. If there are errors in LoginScreen or AppLayout (from type mismatches), those are expected and will be fixed in subsequent tasks.

## Important notes
- Keep `"use client"` directive
- The `supabase` client instance should be created once (not in render)
- Subscribe to auth state changes in useEffect
- Call `getSession()` on mount for initial state
- Return clean-up function with `subscription.unsubscribe()`
