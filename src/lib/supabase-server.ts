import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  missingSupabasePublicKeyVars,
  supabasePublicKeyOrUndefined,
} from "./supabase-public";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Session-aware public client. Prefers NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY over the
  // legacy anon key; never resolves a privileged key.
  const key = supabasePublicKeyOrUndefined();
  if (!url || !key) {
    // Variable NAMES only — never values.
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and " +
        `${missingSupabasePublicKeyVars().join(" or ")} must be set`
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });
}

