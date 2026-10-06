import { createBrowserClient } from "@supabase/ssr";
import {
  missingSupabasePublicKeyVars,
  supabasePublicKeyOrUndefined,
} from "./supabase-public";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Centralised public-credential resolution: prefers NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // and falls back to the legacy anon key during migration. Can never return a
  // privileged key — this value is inlined into the browser bundle.
  const key = supabasePublicKeyOrUndefined();
  if (!url || !key) {
    // Variable NAMES only — never values.
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and " +
        `${missingSupabasePublicKeyVars().join(" or ")} must be set`
    );
  }
  return createBrowserClient(url, key);
}
