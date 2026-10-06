/**
 * Public (unprivileged) Supabase credential resolution — the browser/auth counterpart
 * to `supabase-privileged.ts`.
 *
 * SINGLE SOURCE OF TRUTH for choosing the key used by the browser client, the
 * session-aware server client, and server-side *public/anonymous* clients (read paths
 * that do not bypass RLS). Centralised so it cannot drift between call sites.
 *
 * Selection order:
 *   1. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase's modern Publishable API key
 *      (`sb_publishable_...`). Preferred: it is the supported replacement for the legacy
 *      anon JWT and is not a bearer credential.
 *   2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the legacy JWT anon key. TEMPORARY MIGRATION
 *      FALLBACK ONLY, so environments that have not yet published the modern variable
 *      keep working. This is the fallback that broke production when the legacy JWT keys
 *      were disabled; remove it once every deployment has migrated.
 *
 * Rules enforced by this module:
 *   - NEVER resolves a privileged key. This module cannot return `SUPABASE_SECRET_KEY`
 *     or `SUPABASE_SERVICE_ROLE_KEY`, so it is safe to import from client components.
 *     Privileged/server operations must use `supabase-privileged.ts` instead.
 *   - The `NEXT_PUBLIC_*` prefix is intentional: these values are inlined into the
 *     browser bundle, which is exactly correct for a publishable key and exactly wrong
 *     for a secret. `assertNoPrivilegedSupabaseKeyInPublicVars` guards the latter.
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

export const SUPABASE_PUBLIC_KEY_VARS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type SupabasePublicKeyVar = (typeof SUPABASE_PUBLIC_KEY_VARS)[number];

export type SupabasePublicKeyResolution =
  | { ok: true; key: string; source: SupabasePublicKeyVar }
  | { ok: false; missing: SupabasePublicKeyVar[] };

type EnvLike = Record<string, string | undefined>;

const firstConfigured = (env: EnvLike): SupabasePublicKeyVar | null => {
  for (const name of SUPABASE_PUBLIC_KEY_VARS) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return name;
  }
  return null;
};

/**
 * Resolve the public key. Returns the resolved VALUE plus the variable NAME it came
 * from. The name is safe to log; the value must never be.
 */
export function resolveSupabasePublicKey(env: EnvLike = process.env): SupabasePublicKeyResolution {
  const source = firstConfigured(env);
  if (source === null) return { ok: false, missing: [...SUPABASE_PUBLIC_KEY_VARS] };
  return { ok: true, key: (env[source] as string).trim(), source };
}

/**
 * Resolve just the key value, or `undefined` when neither variable is configured.
 *
 * Preserves the previous behaviour of the public read paths, which passed a
 * non-null-asserted `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` straight through. Use
 * {@link resolveSupabasePublicKey} when you need to report which variables are missing.
 */
export function supabasePublicKeyOrUndefined(env: EnvLike = process.env): string | undefined {
  const resolution = resolveSupabasePublicKey(env);
  return resolution.ok ? resolution.key : undefined;
}

/** Names of the public key variables that are absent or blank. Names only, no values. */
export function missingSupabasePublicKeyVars(env: EnvLike = process.env): SupabasePublicKeyVar[] {
  return SUPABASE_PUBLIC_KEY_VARS.filter(
    (name) => typeof env[name] !== "string" || (env[name] as string).trim() === "",
  );
}

/**
 * Which public credential source the resolver would select, as a closed three-value
 * indicator: `"publishable"` | `"legacy"` | `"missing"`.
 *
 * Deliberately the NARROWEST possible read: it returns one enum word and nothing else.
 * It exposes no key material and no derivative of it — not the value, not its length,
 * not a hash or fingerprint, not a prefix, not the environment variable names, and not how
 * many variables are set. Two different keys resolving from the same variable are
 * indistinguishable by design.
 *
 * Exists so an operator can confirm, with a single read-only call, that a deployment is
 * actually using the modern publishable key rather than the legacy anon JWT.
 */
export type SupabasePublicSourceIndicator = "publishable" | "legacy" | "missing";

export function publicCredentialSourceIndicator(
  env: EnvLike = process.env,
): SupabasePublicSourceIndicator {
  const resolution = resolveSupabasePublicKey(env);
  if (!resolution.ok) return "missing";
  return resolution.source === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ? "publishable" : "legacy";
}

/**
 * Fail-closed guard against publishing a privileged key to the browser.
 *
 * `NEXT_PUBLIC_*` variables are inlined into the client bundle, so any privileged key
 * exposed under that prefix would be a credential leak. Checks the PUBLIC aliases of the
 * privileged variable names, reporting only VARIABLE NAMES. Complements
 * `assertNotPublicSecretVars` in `supabase-privileged.ts`, which the privileged module
 * already enforces; this exists so the public module is self-contained for client-side
 * callers that cannot import server-only code.
 */
export function assertNoPrivilegedSupabaseKeyInPublicVars(env: EnvLike = process.env): void {
  const leakedPublicNames = [
    "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  ].filter((name) => typeof env[name] === "string" && (env[name] as string).trim() !== "");

  if (leakedPublicNames.length > 0) {
    // Variable names only — never their values.
    throw new Error(
      `Privileged Supabase variables must not be exposed to the browser: ${leakedPublicNames.join(", ")}. ` +
        `Remove the NEXT_PUBLIC_* alias; only the publishable key may use that prefix.`,
    );
  }
}