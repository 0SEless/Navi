/**
 * Server-only Supabase privileged-credential resolution.
 *
 * SINGLE SOURCE OF TRUTH for choosing the key used by RLS-bypassing server components
 * (API route handlers and server libraries). Credential *selection order* is centralised
 * here so it cannot drift between call sites.
 *
 * Contract:
 *   `SUPABASE_SECRET_KEY` (`sb_secret_...`) is REQUIRED.
 *
 * There is deliberately no fallback. The legacy `SUPABASE_SERVICE_ROLE_KEY` JWT fallback
 * was removed once the Supabase legacy JWT keys were disabled and the Vercel variable was
 * deleted. Missing configuration now fails closed and loudly instead of silently
 * degrading to a credential tier that no longer works.
 *
 * Rules enforced by this module:
 *   - `SUPABASE_SECRET_KEY` may NEVER be exposed through a `NEXT_PUBLIC_*` name.
 *     `NEXT_PUBLIC_*` is inlined into the browser bundle, so only the publishable key may
 *     use that prefix. `assertNotPublicSecretVars` guards against that mistake being
 *     introduced later.
 *   - Credential VALUES are never returned in diagnostics, logged, or included in errors.
 *     Only variable NAMES are ever reported.
 *
 * This module is server-only by convention (it is imported exclusively from API route
 * handlers and server libraries), matching the existing `env-safety.ts` / `r2.ts`
 * convention. It must never be imported from a client component or browser configuration.
 *
 * SCOPE: this module resolves credentials and reports configuration gaps. It deliberately
 * does NOT construct Supabase clients or add validation the call sites did not already
 * have, so adopting it cannot change a route's failure behaviour. Client construction
 * (including each route's `createServerClient` options) stays with the caller.
 */

export const SUPABASE_SECRET_KEY_VAR = "SUPABASE_SECRET_KEY" as const;

export type SupabaseSecretKeyResolution =
  | { ok: true; key: string; source: typeof SUPABASE_SECRET_KEY_VAR }
  | { ok: false; missing: [typeof SUPABASE_SECRET_KEY_VAR] };

type EnvLike = Record<string, string | undefined>;

const configured = (env: EnvLike, name: string): boolean =>
  typeof env[name] === "string" && (env[name] as string).trim() !== "";

/**
 * Resolve the privileged key. Returns the resolved VALUE plus the variable NAME it came
 * from. The name is safe to log; the value must never be.
 */
export function resolveSupabaseSecretKey(env: EnvLike = process.env): SupabaseSecretKeyResolution {
  if (!configured(env, SUPABASE_SECRET_KEY_VAR)) {
    return { ok: false, missing: [SUPABASE_SECRET_KEY_VAR] };
  }
  return {
    ok: true,
    key: (env[SUPABASE_SECRET_KEY_VAR] as string).trim(),
    source: SUPABASE_SECRET_KEY_VAR,
  };
}

/**
 * Resolve just the key value, or `undefined` when the secret key is not configured.
 *
 * Preserves the previous behaviour of the API routes, which passed a non-null-asserted
 * environment value straight through. Use {@link resolveSupabaseSecretKey} when you need
 * to report which variable is missing.
 */
export function supabaseSecretKeyOrUndefined(env: EnvLike = process.env): string | undefined {
  const resolution = resolveSupabaseSecretKey(env);
  return resolution.ok ? resolution.key : undefined;
}

/** Name of the privileged key variable when absent or blank. Name only, no value. */
export function missingSupabaseSecretKeyVars(env: EnvLike = process.env): SupabaseSecretKeyVar[] {
  return configured(env, SUPABASE_SECRET_KEY_VAR) ? [] : [SUPABASE_SECRET_KEY_VAR];
}

/**
 * Fail-closed guard against publishing a privileged key to the browser.
 *
 * `NEXT_PUBLIC_*` variables are inlined into the client bundle, so any privileged key
 * exposed under that prefix would be a credential leak. Call this from environment
 * validation; it throws naming only the offending VARIABLE NAMES.
 */
export function assertNotPublicSecretVars(env: EnvLike = process.env): void {
  // Report the offending PUBLIC alias, because that is the variable the operator must
  // delete from their environment — not the server-side name it was copied from.
  const leakedPublicNames = ["NEXT_PUBLIC_SUPABASE_SECRET_KEY"].filter((name) =>
    configured(env, name),
  );

  if (leakedPublicNames.length > 0) {
    // Variable names only — never their values.
    throw new Error(
      `Privileged Supabase variables must not be exposed to the browser: ${leakedPublicNames.join(", ")}. ` +
        `Remove the NEXT_PUBLIC_* alias; only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY may use that prefix.`,
    );
  }
}

/**
 * The migration also added a credential-source indicator used by the temporary
 * diagnostic endpoints. Those endpoints are removed, and the indicator had no other
 * consumer, so it is removed with them. `resolveSupabasePublicKey` /
 * `resolveSupabaseSecretKey` remain the supported way to inspect configuration, and both
 * return the source VARIABLE NAME rather than a value.
 */