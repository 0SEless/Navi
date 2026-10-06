/**
 * Server-only Supabase privileged-credential resolution.
 *
 * SINGLE SOURCE OF TRUTH for choosing the key used by RLS-bypassing server components
 * (API route handlers and server libraries). Credential *selection order* is centralised
 * here so it cannot drift between call sites.
 *
 * Selection order:
 *   1. `SUPABASE_SECRET_KEY`  â€” the new Supabase Secret API key (`sb_secret_...`).
 *                                Preferred: rotatable and scoped independently.
 *   2. `SUPABASE_SERVICE_ROLE_KEY` â€” the legacy JWT. TEMPORARY MIGRATION FALLBACK ONLY,
 *                                retained so environments that have not yet published
 *                                `SUPABASE_SECRET_KEY` keep working. Remove once every
 *                                deployment has migrated and the legacy key is deactivated.
 *
 * Rules enforced by this module:
 *   - Neither variable may be exposed through a `NEXT_PUBLIC_*` name. `NEXT_PUBLIC_*` is
 *     inlined into the browser bundle, so only the publishable/anon key may use that prefix.
 *     `assertNotPublicSecretVars` guards against that mistake being introduced later.
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

export const SUPABASE_SECRET_KEY_VARS = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type SupabaseSecretKeyVar = (typeof SUPABASE_SECRET_KEY_VARS)[number];

export type SupabaseSecretKeyResolution =
  | { ok: true; key: string; source: SupabaseSecretKeyVar }
  | { ok: false; missing: SupabaseSecretKeyVar[] };

type EnvLike = Record<string, string | undefined>;

const firstConfigured = (env: EnvLike): SupabaseSecretKeyVar | null => {
  for (const name of SUPABASE_SECRET_KEY_VARS) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return name;
  }
  return null;
};

/**
 * Resolve the privileged key. Returns the resolved VALUE plus the variable NAME it came
 * from. The name is safe to log; the value must never be.
 */
export function resolveSupabaseSecretKey(env: EnvLike = process.env): SupabaseSecretKeyResolution {
  const source = firstConfigured(env);
  if (source === null) return { ok: false, missing: [...SUPABASE_SECRET_KEY_VARS] };
  return { ok: true, key: (env[source] as string).trim(), source };
}

/**
 * Resolve just the key value, or `undefined` when neither variable is configured.
 *
 * Preserves the previous behaviour of the API routes, which passed a non-null-asserted
 * `process.env.SUPABASE_SERVICE_ROLE_KEY` straight through. Use
 * {@link resolveSupabaseSecretKey} when you need to report which variables are missing.
 */
export function supabaseSecretKeyOrUndefined(env: EnvLike = process.env): string | undefined {
  const resolution = resolveSupabaseSecretKey(env);
  return resolution.ok ? resolution.key : undefined;
}

/** Names of the privileged key variables that are absent or blank. Names only, no values. */
export function missingSupabaseSecretKeyVars(env: EnvLike = process.env): SupabaseSecretKeyVar[] {
  return SUPABASE_SECRET_KEY_VARS.filter(
    (name) => typeof env[name] !== "string" || (env[name] as string).trim() === "",
  );
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
  // delete from their environment â€” not the server-side name it was copied from.
  const leakedPublicNames = SUPABASE_SECRET_KEY_VARS.map((name) => `NEXT_PUBLIC_${name}`).filter(
    (publicName) => {
      const value = env[publicName];
      return typeof value === "string" && value.trim() !== "";
    },
  );
  if (leakedPublicNames.length > 0) {
    // Variable names only â€” never their values.
    throw new Error(
      `Privileged Supabase variables must not be exposed to the browser: ${leakedPublicNames.join(", ")}. ` +
      `Remove the NEXT_PUBLIC_* alias; only the publishable/anon key may use that prefix.`,
    );
  }
}

/**
 * Which privileged credential source the resolver would select, as a closed three-value
 * indicator: `"secret"` | `"legacy"` | `"missing"`.
 *
 * This is deliberately the NARROWEST possible read: it returns one enum word and nothing
 * else. It exposes no key material and no derivative of it — not the value, not its length,
 * not a hash or fingerprint, not a prefix, not the environment variable names, and not how
 * many variables are set. Two different keys that resolve from the same variable are
 * indistinguishable by design.
 *
 * Exists so an operator can confirm, with a single read-only call, that a deployment is
 * actually using the new Secret API key. Serve it only behind administrator authorization.
 */
export type SupabaseSecretSourceIndicator = "secret" | "legacy" | "missing";

export function privilegedCredentialSourceIndicator(
  env: EnvLike = process.env,
): SupabaseSecretSourceIndicator {
  const resolution = resolveSupabaseSecretKey(env);
  if (!resolution.ok) return "missing";
  return resolution.source === "SUPABASE_SECRET_KEY" ? "secret" : "legacy";
}
