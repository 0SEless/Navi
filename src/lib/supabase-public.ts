/**
 * Public (unprivileged) Supabase credential resolution — the browser/auth counterpart
 * to `supabase-privileged.ts`.
 *
 * SINGLE SOURCE OF TRUTH for choosing the key used by the browser client, the
 * session-aware server client, and server-side *public/anonymous* clients (read paths
 * that do not bypass RLS). Centralised so it cannot drift between call sites.
 *
 * Contract:
 *   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) is REQUIRED.
 *
 * There is deliberately no fallback. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` JWT
 * fallback was removed once the Supabase legacy JWT keys were disabled and the Vercel
 * variable was deleted; retaining it would mean silently depending on a credential tier
 * that no longer exists. Missing configuration now fails closed and loudly instead.
 *
 * Rules enforced by this module:
 *   - NEVER resolves a privileged key. This module cannot return `SUPABASE_SECRET_KEY`,
 *     so it is safe to import from client components. Privileged/server operations must
 *     use `supabase-privileged.ts` instead.
 *   - The `NEXT_PUBLIC_*` prefix is intentional: this value is inlined into the browser
 *     bundle, which is exactly correct for a publishable key and exactly wrong for a
 *     secret. `assertNoPrivilegedSupabaseKeyInPublicVars` guards the latter.
 *   - Credential VALUES are never returned in diagnostics, logged, or included in errors.
 *     Only variable NAMES are ever reported.
 *
 * This module is isomorphic: it reads no Node-only or browser-only API, so it can be
 * imported from both `supabase-client.ts` (browser) and server routes.
 *
 * SCOPE: this module resolves credentials and reports configuration gaps. It deliberately
 * does NOT construct Supabase clients or add validation the call sites did not already
 * have, so adopting it cannot change a route's failure behaviour. Client construction
 * (including each call site's `createServerClient` options) stays with the caller.
 */

export const SUPABASE_PUBLIC_KEY_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" as const;

export type SupabasePublicKeyResolution =
  | { ok: true; key: string; source: typeof SUPABASE_PUBLIC_KEY_VAR }
  | { ok: false; missing: [typeof SUPABASE_PUBLIC_KEY_VAR] };

type EnvLike = Record<string, string | undefined>;

const configured = (env: EnvLike, name: string): boolean =>
  typeof env[name] === "string" && (env[name] as string).trim() !== "";

/**
 * Resolve the public key. Returns the resolved VALUE plus the variable NAME it came
 * from. The name is safe to log; the value must never be.
 */
export function resolveSupabasePublicKey(env: EnvLike = process.env): SupabasePublicKeyResolution {
  if (!configured(env, SUPABASE_PUBLIC_KEY_VAR)) {
    return { ok: false, missing: [SUPABASE_PUBLIC_KEY_VAR] };
  }
  return {
    ok: true,
    key: (env[SUPABASE_PUBLIC_KEY_VAR] as string).trim(),
    source: SUPABASE_PUBLIC_KEY_VAR,
  };
}

/**
 * Resolve just the key value, or `undefined` when the publishable key is not configured.
 *
 * Preserves the previous behaviour of the public read paths, which passed a
 * non-null-asserted environment value straight through. Use
 * {@link resolveSupabasePublicKey} when you need to report which variable is missing.
 */
export function supabasePublicKeyOrUndefined(env: EnvLike = process.env): string | undefined {
  const resolution = resolveSupabasePublicKey(env);
  return resolution.ok ? resolution.key : undefined;
}

/** Name of the public key variable when absent or blank. Name only, no value. */
export function missingSupabasePublicKeyVars(env: EnvLike = process.env): SupabasePublicKeyVar[] {
  return configured(env, SUPABASE_PUBLIC_KEY_VAR) ? [] : [SUPABASE_PUBLIC_KEY_VAR];
}

/**
 * Fail-closed guard against publishing a privileged key to the browser.
 *
 * `NEXT_PUBLIC_*` variables are inlined into the client bundle, so any privileged key
 * exposed under that prefix would be a credential leak. Checks the PUBLIC aliases of the
 * privileged variable names, reporting only VARIABLE NAMES. Exists so the public module
 * is self-contained for client-side callers that must not import server-only code.
 */
export function assertNoPrivilegedSupabaseKeyInPublicVars(env: EnvLike = process.env): void {
  const leakedPublicNames = [
    "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  ].filter((name) => configured(env, name));

  if (leakedPublicNames.length > 0) {
    // Variable names only — never their values.
    throw new Error(
      `Privileged Supabase variables must not be exposed to the browser: ${leakedPublicNames.join(", ")}. ` +
        `Remove the NEXT_PUBLIC_* alias; only ${SUPABASE_PUBLIC_KEY_VAR} may use that prefix.`,
    );
  }
}